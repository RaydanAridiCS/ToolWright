import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Alert, Badge, Plate, ResultSlab, SegmentedControl, Stat, StatGrid, StatusLine, Toggle, buttonClasses } from "../src";

describe("Plate", () => {
  it("renders the caption strip, content and footer, with decorative crop marks", () => {
    const { container } = render(
      <Plate aria-label="JSON Formatter" label="Tool 014 · Developer" actions={<button>Star</button>} footer={<StatusLine>0 outside requests</StatusLine>}>
        <p>content</p>
      </Plate>,
    );
    expect(screen.getByRole("region", { name: "JSON Formatter" })).toBeInTheDocument();
    expect(screen.getByText("Tool 014 · Developer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Star" })).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.getByText("0 outside requests")).toBeInTheDocument();
    const marks = container.querySelectorAll("i[aria-hidden='true']");
    expect(marks).toHaveLength(4);
  });

  it("omits the caption strip when there is nothing to put in it, and can drop padding", () => {
    const { container } = render(
      <Plate padded={false}>
        <p>bare</p>
      </Plate>,
    );
    expect(container.querySelector("header")).toBeNull();
    expect(screen.getByText("bare").parentElement).not.toHaveClass("p-4");
  });
});

describe("ResultSlab", () => {
  it("shows a label, a large value and a test id, and announces changes politely", () => {
    const { container } = render(<ResultSlab label="Payment per period" value="$1,580.17" valueTestId="payment" note="Over 30 years" />);
    expect(screen.getByTestId("payment")).toHaveTextContent("$1,580.17");
    expect(screen.getByText("Payment per period")).toBeInTheDocument();
    expect(screen.getByText("Over 30 years")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("aria-live", "polite");
    expect(screen.getByTestId("payment").className).toContain("text-5xl");
  });

  it("has a medium size for sentences", () => {
    render(<ResultSlab label="In plain English" value="Every 15 minutes" size="md" valueTestId="v" />);
    expect(screen.getByTestId("v").className).toContain("text-3xl");
    expect(screen.getByTestId("v").className).not.toContain("break-all");
  });
});

describe("restyled primitives", () => {
  it("buttons: primary lifts with a hard shadow at md/lg, small ones stay flat, ghost lights up with the marker", () => {
    expect(buttonClasses("primary", "md")).toContain("shadow-md");
    expect(buttonClasses("primary", "lg")).toContain("active:shadow-none");
    expect(buttonClasses("primary", "sm")).not.toContain("shadow-md");
    expect(buttonClasses("ghost", "md")).toContain("hover:bg-marker");
    expect(buttonClasses("outline", "md")).toContain("hover:bg-marker");
    expect(buttonClasses("primary", "md")).not.toMatch(/rounded-(full|xl|2xl)|gradient/);
  });

  it("badges are square mono outlines, never filled pills", () => {
    render(<Badge tone="success">Pass</Badge>);
    const cls = screen.getByText("Pass").className;
    expect(cls).toContain("border-success");
    expect(cls).toContain("font-mono");
    expect(cls).not.toMatch(/rounded-full|bg-/);
  });

  it("alerts: errors use role=alert with a danger left bar; others use role=status", () => {
    const { rerender } = render(<Alert tone="error">Broken</Alert>);
    expect(screen.getByRole("alert").className).toContain("border-l-danger");
    rerender(<Alert tone="success">Done</Alert>);
    expect(screen.getByRole("status").className).toContain("border-l-success");
    rerender(<Alert tone="warning">Careful</Alert>);
    expect(screen.getByRole("status").className).toContain("border-l-warning");
  });

  it("stat cells share borders inside a grid instead of floating as separate boxes", () => {
    const { container } = render(
      <StatGrid>
        <Stat label="Words" value={3} />
        <Stat label="Characters" value={14} />
      </StatGrid>,
    );
    expect(container.querySelector("dl")?.className).toContain("border-l");
    expect(screen.getByText("Words").parentElement?.className).toContain("border-r");
    expect(screen.getByText("14")).toBeInTheDocument();
  });

  it("toggle is a square switch that still behaves as a switch", async () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return <Toggle label="Sort keys" checked={on} onCheckedChange={setOn} />;
    }
    render(<Harness />);
    const sw = screen.getByRole("switch", { name: "Sort keys" });
    expect(sw.className).not.toContain("rounded-full");
    expect(sw.className).toContain("rounded-sm");
    await userEvent.click(sw);
    expect(sw).toBeChecked();
  });

  it("segmented control marks the active choice with the highlighter and keeps radio semantics", async () => {
    function Harness() {
      const [v, setV] = useState<"a" | "b">("a");
      return (
        <SegmentedControl
          label="Mode"
          value={v}
          onValueChange={setV}
          options={[
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" },
          ]}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByText("Alpha").closest("label")?.className).toContain("bg-marker");
    expect(screen.getByText("Beta").closest("label")?.className).not.toContain("bg-marker");
    await userEvent.click(screen.getByText("Beta"));
    expect(screen.getByRole("radio", { name: "Beta" })).toBeChecked();
    expect(screen.getByText("Beta").closest("label")?.className).toContain("bg-marker");
  });
});
