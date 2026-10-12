# Cross-translation reading

Extra reading of retrieve_quote answers. It does not change the headline correct bit, and it does not replace LLM-as-a-judge.

Asking for one tradition's scripture and receiving another's wording is a
different miss from a fabricated verse. The headline score still marks both 0.

## What the index already contains

Of 31,095 verses present in KJV, ASV, and WEB, 410 (1.3%) still match after the scorer's normalisation. 30,685 do not. A model can quote a real edition and still fail the edition it was asked for.

The Protestant KJV and the Latter-day Saint 2013 KJV share 31,102 citations. 29,303 match. 1,799 do not. Those differences are orthography (a space, a hyphen, an æ), and they are enough for a normalized exact match to fail.

The same folded string is sometimes a real verse in two traditions (at least 12 tokens, matched to the Protestant KJV):

- **Book of Mormon**: 200 verses (Isaiah 150, Matthew 32, Malachi 14, Exodus 3, Deuteronomy 2, Luke 1, Micah 1).
- **Doctrine and Covenants**: 4 verses (1 Peter 2, 1 Corinthians 1, Luke 1).
- **Pearl of Great Price**: 26 verses (Genesis 16, Matthew 10, Mark 1).

A verse can match more than one KJV book, so a work's book counts can add up to more than its verse count.

Quoting those words and citing either passage is faithful to the index.
A task that demands one citation treats the other citation as a wrong answer.

## What the answers did

400 answers: 26 requested, 1 other tradition, 4 other edition, 369 unmatched.

### Asked for one tradition, matched another tradition's wording

- `claude-haiku` was asked for **Protestant Christian** KJV Isaiah 4:6 (`contained`). The answer matches **The Church of Jesus Christ of Latter-Day Saints** KJV (LDS 2013 edition).
  - Asked: And there shall be a tabernacle for a shadow in the day time from the heat, and for a place of refuge, and for a covert from storm and from rain.
  - Answer: And there shall be a tabernacle for a shadow in the daytime from the heat, and for a place of refuge, and for a covert from storm and from rain.
  - Matched: And there shall be a tabernacle for a shadow in the daytime from the heat, and for a place of refuge, and for a covert from storm and from rain.

### Asked for one edition, matched another edition of that tradition

- `llama-3.1-8b` was asked for **Protestant Christian** WEB John 13:3 (`contained`). The answer matches **Protestant Christian** KJV.
  - Asked: Jesus, knowing that the Father had given all things into his hands, and that he came from God, and was going to God,
  - Answer: Jesus, knowing that the Father had given all things into his hands, and that he was come from God and went to God. (John 13:3)
  - Matched: Jesus knowing that the Father had given all things into his hands, and that he was come from God, and went to God;
  - That matched wording is also stored as: The Church of Jesus Christ of Latter-Day Saints / KJV (LDS 2013 edition) / John 13:3.
- `claude-haiku` was asked for **Protestant Christian** ASV (1901) Isaiah 55:10 (`contained`). The answer matches **Protestant Christian** KJV.
  - Asked: For as the rain cometh down and the snow from heaven, and returneth not thither, but watereth the earth, and maketh it bring forth and bud, and giveth seed to the sower and bread to the eater;
  - Answer: For as the rain cometh down, and the snow from heaven, and returneth not thither, but watereth the earth, and maketh it bring forth and bud, that it may give seed to the sower and bread to the eater:
  - Matched: For as the rain cometh down, and the snow from heaven, and returneth not thither, but watereth the earth, and maketh it bring forth and bud, that it may give seed to the sower, and bread to the eater:
  - That matched wording is also stored as: The Church of Jesus Christ of Latter-Day Saints / KJV (LDS 2013 edition) / Isaiah 55:10.
- `llama-3.1-8b` was asked for **Protestant Christian** ASV (1901) Mark 7:9 (`contained`). The answer matches **Protestant Christian** KJV.
  - Asked: And he said unto them, Full well do ye reject the commandment of God, that ye may keep your tradition.
  - Answer: And he said unto them, Full well ye reject the commandment of God, that ye may keep your own tradition.
  - Matched: And he said unto them, Full well ye reject the commandment of God, that ye may keep your own tradition.
  - That matched wording is also stored as: The Church of Jesus Christ of Latter-Day Saints / KJV (LDS 2013 edition) / Mark 7:9.
- `claude-haiku` was asked for **Protestant Christian** ASV (1901) Judges 18:24 (`closer`). The answer matches **Protestant Christian** KJV.
  - Asked: And he said, ye have taken away my gods which I made, and the priest, and are gone away, and what have I more? and how then say ye unto me, What aileth thee?
  - Answer: "And they said, Ye have taken away my gods which I made, and the priest, and ye are gone away: and what have I more? and what is this that ye say unto me, What aileth thee?"
  - Matched: And he said, Ye have taken away my gods which I made, and the priest, and ye are gone away: and what have I more? and what is this that ye say unto me, What aileth thee?
  - That matched wording is also stored as: The Church of Jesus Christ of Latter-Day Saints / KJV (LDS 2013 edition) / Judges 18:24.
