"""A FAccT reading of a finished run. The headline ``correct`` bit stays put.

The tradition table mixes four different objects: a public-domain KJV, two
other public-domain Bible editions, Vatican encyclicals, and an English
Talmud. This report splits each answer, checks whether any indexed edition of
the same citation would have passed, and writes the benchmark card a reviewer
needs in order to know what the percentage is allowed to mean.

Scholar and community review is recorded as not attached.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

from sacredbench.cross_translation import (
    EditionIndex,
    bible_agreement,
    cite_key,
    classify_quote,
    index_documents,
    kjv_vs_lds,
    same_words_other_tradition,
)
from sacredbench.score import normalize, token_f1

_DIVINE = {"lord", "jehovah", "yahweh"}
_REFUSAL = re.compile(
    r"\b(?:i(?:'m| am) sorry|i can(?:not|'t)|i(?:'m| am) unable|"
    r"cannot reliably reproduce|can(?:not|'t) reliably reproduce|"
    r"i can(?:not|'t) help)\b",
    re.IGNORECASE,
)
_LABELS = (
    "exact",
    "right_verse_plus_extra",
    "other_tradition",
    "other_edition",
    "near_miss",
    "refusal",
    "empty",
    "fabrication",
)

USES = [
    "See whether a model recited the edition the prompt named.",
    "Separate a refusal from a fluent wrong verse, a right verse with extra words, and another indexed edition.",
    "See how many Bible misses would pass if every indexed edition of that citation were gold.",
    "See who the questions represent, by tradition, language, document type, and license.",
]
_KIND = {
    "exact": "exact recitation of the named edition",
    "right_verse_plus_extra": "right verse with extra words",
    "other_tradition": "another tradition's wording",
    "other_edition": "another edition",
    "near_miss": "near miss",
    "refusal": "refusal",
    "empty": "empty answer",
    "fabrication": "fluent text that is not an indexed wording",
}

REFUSED = [
    "A tradition column counts the questions that named that tradition.",
    "Exact-match order puts a refusal and a fabrication in the same zero.",
    "The community-review line records an empty seat.",
    "The mix describes this panel on the tasks that were scored.",
]

NON_USES = [
    "The headline percentage does not rank traditions and does not measure knowledge of a faith.",
    "A tradition column is the slice that was asked, which may be encyclicals or an English Talmud rather than that community's scripture.",
    "The card is not a community adjudication. Scholar review is not attached.",
    "Jev, when run, is a closed-question probability. It is not a scholar of any tradition in the set.",
    "Restricted sources (NABRE, Greek Orthodox extracts) are not in the questions.",
]


class FacctError(Exception):
    pass


def _divine_key(text: str) -> str:
    return " ".join("name" if tok in _DIVINE else tok for tok in normalize(text).split())


def _hyphen_key(text: str) -> str:
    return normalize(text.replace("-", "").replace("‐", "").replace("‑", ""))


def _three_way(index: EditionIndex, key_fn) -> dict:
    versions = ("KJV", "ASV (1901)", "WEB")
    grouped: dict[tuple, dict[str, str]] = {}
    for cite, passages in index.by_cite.items():
        for passage in passages:
            if passage.work == "The Bible" and passage.version in versions:
                grouped.setdefault(cite, {})[passage.version] = key_fn(passage.text)
    shared = [keys for keys in grouped.values() if set(keys) == set(versions)]
    same = sum(1 for keys in shared if len(set(keys.values())) == 1)
    return {"verses_in_all_three": len(shared), "same": same, "differ": len(shared) - same}


def folding_rules(index: EditionIndex) -> list[dict]:
    chosen = bible_agreement(index)
    divine = _three_way(index, _divine_key)
    hyphen = _three_way(index, _hyphen_key)
    return [
        {
            "rule": "case and punctuation folded (the scorer's normalize)",
            "chosen": True,
            "all_three_agree": chosen["same_after_normalize"],
            "verses_in_all_three": chosen["verses_in_all_three"],
        },
        {
            "rule": "also fold Lord, Jehovah, and Yahweh",
            "chosen": False,
            "all_three_agree": divine["same"],
            "verses_in_all_three": divine["verses_in_all_three"],
        },
        {
            "rule": "also delete hyphens before folding",
            "chosen": False,
            "all_three_agree": hyphen["same"],
            "verses_in_all_three": hyphen["verses_in_all_three"],
        },
    ]


def _source(row: dict) -> dict:
    question = row.get("question")
    if not isinstance(question, dict):
        raise FacctError("answer row has no embedded question")
    source = question.get("source")
    expected = question.get("expected")
    if not isinstance(source, dict) or not isinstance(expected, dict) or "text" not in expected:
        raise FacctError("answer row question is missing source or expected text")
    tradition = source.get("tradition") or []
    if isinstance(tradition, str):
        tradition = [tradition]
    return {
        "tradition": tradition[0] if tradition else "unknown",
        "work": source.get("work") or "",
        "version": source.get("version") or "",
        "language": source.get("language") or "unknown",
        "document_type": source.get("document_type") or "unknown",
        "citation": source.get("citation") or "",
        "expected_text": expected["text"],
    }


def license_for(source: dict, by_key: dict[tuple[str, str, str], str]) -> str:
    """Catalogue license, with encyclicals falling back to the tradition target.

    Encyclical documents take their work from the file title, so they do not
    match the catalogue target's nominal work name.
    """
    found = by_key.get((source["work"], source["version"], source["language"]))
    if found:
        return found
    if source["document_type"] == "encyclical":
        return "open"
    return "unspecified"


def _opening(text: str) -> str:
    """Straighten quotes, then keep the first words, where a refusal announces itself."""
    text = unicodedata.normalize("NFKD", text or "")
    text = text.replace("‘", "'").replace("’", "'").replace("`", "'")
    words = text.split()
    return " ".join(words[:12])


def is_refusal(answer: str) -> bool:
    opening = _opening(answer)
    if not opening:
        return False
    return bool(_REFUSAL.search(opening))


def _editions_contained(index: EditionIndex, citation: str, answer: str) -> list[dict]:
    key = cite_key(citation)
    if key is None:
        return []
    answer_norm = normalize(answer or "")
    found = []
    seen: set[tuple[str, str]] = set()
    for passage in index.by_cite.get(key, []):
        ident = (passage.tradition, passage.version)
        if ident in seen or not passage.norm or passage.norm not in answer_norm:
            continue
        if len(passage.norm.split()) < 4:
            continue
        seen.add(ident)
        found.append({"tradition": passage.tradition, "version": passage.version, "work": passage.work})
    return found


def _shared_other_traditions(index: EditionIndex, expected: str, tradition: str) -> list[dict]:
    norm = normalize(expected or "")
    if len(norm.split()) < 12:
        return []
    found = []
    seen: set[tuple[str, str, str]] = set()
    for passage in index.by_norm.get(norm, []):
        if passage.tradition == tradition:
            continue
        ident = (passage.tradition, passage.work, passage.citation)
        if ident in seen:
            continue
        seen.add(ident)
        found.append(
            {"tradition": passage.tradition, "work": passage.work, "version": passage.version, "citation": passage.citation}
        )
    return found


def label_answer(row: dict, index: EditionIndex) -> dict:
    """One mutually exclusive label. Headline equality is ``exact``."""
    source = _source(row)
    answer = row.get("answer") or ""
    expected = source["expected_text"]
    if not answer.strip():
        label = "empty"
        match_kind = None
    elif normalize(answer) == normalize(expected):
        label = "exact"
        match_kind = "contained"
    elif normalize(expected) and normalize(expected) in normalize(answer):
        label = "right_verse_plus_extra"
        match_kind = "contained"
    elif is_refusal(answer):
        label = "refusal"
        match_kind = None
    else:
        judged = classify_quote(
            answer, source["tradition"], source["version"], source["citation"], expected, index
        )
        if judged["label"] in ("other_tradition", "other_edition"):
            label = judged["label"]
            match_kind = judged["match_kind"]
        elif token_f1(answer, expected) >= 0.7:
            label = "near_miss"
            match_kind = None
        else:
            label = "fabrication"
            match_kind = None
    editions = _editions_contained(index, source["citation"], answer)
    shared = _shared_other_traditions(index, expected, source["tradition"])
    return {
        "label": label,
        "match_kind": match_kind,
        "tradition": source["tradition"],
        "document_type": source["document_type"],
        "language": source["language"],
        "work": source["work"],
        "version": source["version"],
        "editions_contained": editions,
        "any_indexed_edition": bool(editions),
        "plural_gold": bool(shared),
        "shared_with": shared[:6],
        "citation": source["citation"],
    }


def _item_detail(item: dict) -> str:
    asked = (item["tradition"], item["version"])
    others = [
        f"{ed['tradition']} · {ed['version']}"
        for ed in item["editions_contained"]
        if (ed["tradition"], ed["version"]) != asked
    ]
    if item["label"] in ("other_tradition", "other_edition") and others:
        return "contains " + "; ".join(others[:3])
    if item["label"] in ("exact", "right_verse_plus_extra") and item["plural_gold"] and item["shared_with"]:
        shared = item["shared_with"][0]
        return f"same words as {shared['tradition']} {shared['work']} {shared['citation']}"
    return ""


def _rates(pairs: list[tuple[str, dict]]) -> dict[str, dict]:
    """pairs of (group, labeled row)."""
    out: dict[str, dict] = {}
    for name, row in pairs:
        slot = out.setdefault(name, {"n": 0, "headline_correct": 0, "labels": Counter()})
        slot["n"] += 1
        slot["headline_correct"] += int(row["label"] == "exact")
        slot["labels"][row["label"]] += 1
    for slot in out.values():
        slot["labels"] = {label: slot["labels"].get(label, 0) for label in _LABELS}
    return dict(sorted(out.items()))


def build_facct(
    docs: list,
    rows: list[dict],
    license_index: dict[tuple[str, str, str], str],
    catalogue_languages: list[str],
    panel: dict | None = None,
) -> dict:
    index = index_documents(docs)
    labeled = []
    for row in rows:
        item = label_answer(row, index)
        source = _source(row)
        item["license"] = license_for(source, license_index)
        item["model_id"] = row.get("model_id")
        item["question_id"] = row.get("question_id")
        labeled.append(item)

    labels = Counter(item["label"] for item in labeled)
    by_model = _rates([(item["model_id"] or "unknown", item) for item in labeled])
    by_tradition = _rates([(item["tradition"], item) for item in labeled])
    by_license = _rates([(item["license"], item) for item in labeled])
    by_document_type = _rates([(item["document_type"], item) for item in labeled])

    questions: dict[str, dict] = {}
    for item in labeled:
        questions.setdefault(item["question_id"], item)
    q_lang = Counter(item["language"] for item in questions.values())
    q_trad = Counter(item["tradition"] for item in questions.values())
    q_doc = Counter(item["document_type"] for item in questions.values())
    q_lic = Counter(item["license"] for item in questions.values())
    languages = {lang: q_lang.get(lang, 0) for lang in sorted(set(catalogue_languages) | set(q_lang))}
    plural_questions = sum(1 for item in questions.values() if item["plural_gold"])

    bible = [item for item in labeled if item["document_type"] == "scripture" and item["work"] == "The Bible"]
    asked_contained = sum(
        1 for item in bible if item["label"] in ("exact", "right_verse_plus_extra")
    )
    any_edition = sum(1 for item in bible if item["any_indexed_edition"])
    fail_but_any = sum(
        1
        for item in bible
        if item["label"] not in ("exact", "right_verse_plus_extra") and item["any_indexed_edition"]
    )

    return {
        "note": (
            "Extra reading. The headline correct bit is unchanged. "
            "A tradition percentage is the slice that was asked, not a measure of a faith."
        ),
        "answers": {"n": len(labeled), "labels": {label: labels.get(label, 0) for label in _LABELS}},
        "by_model": by_model,
        "by_tradition": by_tradition,
        "by_license": by_license,
        "by_document_type": by_document_type,
        "counterfactual_bible": {
            "n": len(bible),
            "asked_edition_contained": asked_contained,
            "any_indexed_edition_contained": any_edition,
            "headline_miss_but_some_edition_contained": fail_but_any,
        },
        "coverage": {
            "questions": len(questions),
            "by_tradition": dict(sorted(q_trad.items())),
            "by_language": languages,
            "by_document_type": dict(sorted(q_doc.items())),
            "by_license": dict(sorted(q_lic.items())),
            "plural_gold_questions": plural_questions,
        },
        "corpus": {
            "scripture_passages": len(index.passages),
            "three_public_domain_bibles": bible_agreement(index),
            "protestant_kjv_vs_lds_kjv": kjv_vs_lds(index),
            "other_tradition_same_words": same_words_other_tradition(index, 12),
            "folding_rules": folding_rules(index),
        },
        "items": [
            {
                "question_id": item["question_id"],
                "model_id": item["model_id"],
                "label": item["label"],
                "citation": item["citation"],
                "version": item["version"],
                "tradition": item["tradition"],
                "document_type": item["document_type"],
                "license": item["license"],
                "detail": _item_detail(item),
            }
            for item in labeled
        ],
        "card": {
            "uses": USES,
            "non_uses": NON_USES,
            "community_review": "Not attached. The decisions in this card are pipeline records.",
            "claim": _claim(labels, by_license, len(labeled)),
            "threats": _threats(
                {
                    "by_language": languages,
                },
                sorted({row.get("task") or (row.get("question") or {}).get("task") or "unknown" for row in rows}),
                plural_questions,
                _run_conditions(rows, panel),
            ),
            "refused": REFUSED,
            "tasks_in_this_run": sorted(
                {row.get("task") or (row.get("question") or {}).get("task") or "unknown" for row in rows}
            ),
            "tasks_the_generator_can_build": [
                "identify_version",
                "retrieve_quote",
                "verify_source",
                "complete_unit",
                "cite_passage",
                "identify_source",
            ],
        },
    }


def _mix(labels: dict) -> str:
    parts = [f"{labels.get(label, 0)} {_KIND[label]}" for label in _LABELS if labels.get(label, 0)]
    return ", ".join(parts)


def _run_conditions(rows: list[dict], panel: dict | None) -> dict:
    recorded = sum(1 for row in rows if row.get("temperature") is not None)
    hosts = []
    for model_id, spec in (panel or {}).items():
        if not isinstance(spec, dict):
            continue
        served = spec.get("served_by") or []
        if isinstance(served, list) and len(served) > 1:
            hosts.append({"model_id": model_id, "hosts": [str(host) for host in served]})
    return {"temperature_rows": recorded, "n_rows": len(rows), "multi_host": hosts}


def _claim(labels: dict, by_license: dict, n: int) -> str:
    license_bits = [
        f"{slot['headline_correct']} of {slot['n']} {name} answers are exact"
        for name, slot in by_license.items()
    ]
    return (
        f"Of {n} answers, {labels.get('exact', 0)} are an exact recitation of the named edition. "
        f"The full split is {_mix(labels)}. "
        f"By license: {'; '.join(license_bits)}."
    )


def _threats(coverage: dict, tasks: list[str], plural: int, conditions: dict) -> list[str]:
    languages = coverage["by_language"]
    asked = [f"{lang} {n}" for lang, n in languages.items() if n]
    empty = [f"{lang} {n}" for lang, n in languages.items() if n == 0]
    threats = [
        (
            f"Questions in this draw: {', '.join(asked) or 'none recorded'}. "
            f"Catalogue languages with no questions: {', '.join(empty) or 'none'}."
        ),
        (
            f"Tasks scored: {', '.join(tasks)}. "
            "The generator can also build identify_version, verify_source (including false premises), "
            "complete_unit, cite_passage, and identify_source."
        ),
        (
            f"{plural} questions use a string that is also a passage of another tradition. "
            "An exact match on those questions is that shared string."
        ),
        "One seeded draw. This card carries no estimate of how the mix would move under another seed.",
        "Scholar and community review is an empty seat. The labels are pipeline records.",
    ]
    if conditions["n_rows"] and conditions["temperature_rows"] == 0:
        threats.append(
            "Temperature is absent from the answer rows. "
            "The example panel for a later collection pins temperature 0. This collection was left as it was stored."
        )
    elif conditions["temperature_rows"] < conditions["n_rows"]:
        threats.append(
            f"Temperature is stored on {conditions['temperature_rows']} of {conditions['n_rows']} answer rows."
        )
    for host in conditions["multi_host"]:
        names = ", ".join(host["hosts"])
        threats.append(
            f"{host['model_id']} lists {len(host['hosts'])} serving hosts in the panel record ({names}). "
            "Each answer row leaves the host unnamed."
        )
    return threats


def panel_beside(answers: Path) -> dict | None:
    """The scored run's panel record, when summary.json sits next to the answers."""
    path = answers.parent / "summary.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    panel = data.get("panel") if isinstance(data, dict) else None
    return panel if isinstance(panel, dict) else None


def license_index_from_targets(targets) -> dict[tuple[str, str, str], str]:
    return {(t.work, t.version, t.language): t.license for t in targets}


def _counts(mapping: dict) -> str:
    return ", ".join(f"{name} {value}" for name, value in mapping.items())


def report_markdown(report: dict) -> str:
    labels = report["answers"]["labels"]
    counter = report["counterfactual_bible"]
    coverage = report["coverage"]
    lines = [
        "# Benchmark card",
        "",
        report["note"],
        "",
        "## Claim",
        "",
        report["card"].get("claim", ""),
        "",
        "## What would make this claim fail",
        "",
    ]
    lines += [f"- {item}" for item in report["card"].get("threats", [])]
    lines += ["", "## What this card will not conclude", ""]
    lines += [f"- {item}" for item in report["card"].get("refused", [])]
    lines += ["", "## What this score is for", ""]
    lines += [f"- {item}" for item in report["card"]["uses"]]
    lines += ["", "## What this score is not for", ""]
    lines += [f"- {item}" for item in report["card"]["non_uses"]]
    lines += [
        "",
        f"Community review: {report['card']['community_review']}",
        "",
        "## Who the questions are",
        "",
        f"{coverage['questions']} questions. Traditions: {_counts(coverage['by_tradition'])}.",
        f"Languages (a language with no questions is a count of 0): {_counts(coverage['by_language'])}.",
        f"Document types: {_counts(coverage['by_document_type'])}.",
        f"Licenses: {_counts(coverage['by_license'])}.",
        (
            f"{coverage['plural_gold_questions']} questions use a string that is also a passage "
            "of another tradition. Quoting those words under either citation is faithful to the index."
        ),
        "",
        "## What each answer was",
        "",
        f"{report['answers']['n']} answers. {_counts(labels)}.",
        "",
        (
            f"Of {counter['n']} Bible answers, {counter['asked_edition_contained']} contain the "
            f"edition that was asked for, and {counter['any_indexed_edition_contained']} contain "
            f"some indexed edition of that citation. "
            f"{counter['headline_miss_but_some_edition_contained']} miss the headline and still "
            "contain another indexed edition."
        ),
        "",
        "### By model",
        "",
    ]
    for model, slot in report["by_model"].items():
        lines.append(
            f"- **{model}**: {slot['headline_correct']}/{slot['n']} exact. {_counts(slot['labels'])}."
        )
    lines += ["", "### By tradition", ""]
    for name, slot in report["by_tradition"].items():
        lines.append(f"- **{name}**: {slot['headline_correct']}/{slot['n']} exact. {_counts(slot['labels'])}.")
    lines += ["", "### By license", ""]
    for name, slot in report["by_license"].items():
        lines.append(f"- **{name}**: {slot['headline_correct']}/{slot['n']} exact. {_counts(slot['labels'])}.")
    lines += ["", "### By document type", ""]
    for name, slot in report["by_document_type"].items():
        lines.append(f"- **{name}**: {slot['headline_correct']}/{slot['n']} exact. {_counts(slot['labels'])}.")
    lines += ["", "## Folding rules on KJV, ASV, and WEB", ""]
    for rule in report["corpus"]["folding_rules"]:
        mark = "chosen" if rule["chosen"] else "alternate"
        lines.append(
            f"- ({mark}) {rule['rule']}: {rule['all_three_agree']} of {rule['verses_in_all_three']} agree."
        )
    tasks = ", ".join(report["card"]["tasks_in_this_run"])
    lines += [
        "",
        f"This run scored: {tasks}.",
        "The generator can also build identify_version, verify_source (including false premises), "
        "complete_unit, cite_passage, and identify_source.",
        "",
    ]
    return "\n".join(lines)
