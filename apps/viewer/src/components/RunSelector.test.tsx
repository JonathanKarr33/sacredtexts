import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RunSelector } from "./RunSelector";

const runs = [{ id: "run-b" }, { id: "run-a" }];

describe("RunSelector", () => {
  it("lists every run and calls onSelect with the chosen id", async () => {
    const onSelect = vi.fn();
    render(<RunSelector runs={runs} selectedId="run-b" onSelect={onSelect} />);
    const select = screen.getByLabelText("Run") as HTMLSelectElement;
    expect(select.value).toBe("run-b");
    expect(screen.getByRole("option", { name: "run-a" })).toBeInTheDocument();
    await userEvent.selectOptions(select, "run-a");
    expect(onSelect).toHaveBeenCalledWith("run-a");
  });

  it("shows a localized error but keeps the selector usable and all runs listed", () => {
    render(
      <RunSelector
        runs={runs}
        selectedId="run-b"
        onSelect={() => {}}
        error="Could not load run run-b: missing: …"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/Could not load run run-b/);
    // the selector is still present and still lists both runs
    const select = screen.getByLabelText("Run") as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    expect(screen.getByRole("option", { name: "run-a" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "run-b" })).toBeInTheDocument();
  });
});
