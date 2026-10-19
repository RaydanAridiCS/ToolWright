import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  DownloadButton,
  Field,
  FileDropzone,
  FileListItem,
  Input,
  SegmentedControl,
  Select,
  Stat,
  Toggle,
  baseName,
  buttonClasses,
  cn,
  copyText,
  downloadBlob,
  fileExtension,
  formatFileSize,
  matchesAccept,
} from "../src";

describe("cn", () => {
  it("merges and resolves Tailwind conflicts", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    const disabled = false;
    expect(cn("a", disabled && "b", undefined, ["c"])).toBe("a c");
  });
});

describe("Button", () => {
  it("renders, defaults to type=button and handles clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
  it("does not fire when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
  it("applies variant classes and lets callers override", () => {
    expect(buttonClasses("primary", "md")).toContain("bg-primary");
    expect(buttonClasses("danger", "sm", "h-20")).toContain("h-20");
    expect(buttonClasses("danger", "sm", "h-20")).not.toContain("h-8");
  });
});

describe("form controls", () => {
  it("associates Field labels with controls", async () => {
    render(<Field label="Name">{(id) => <Input id={id} />}</Field>);
    await userEvent.type(screen.getByLabelText("Name"), "Ada");
    expect(screen.getByLabelText("Name")).toHaveValue("Ada");
  });
  it("shows a hint", () => {
    render(<Field label="Name" hint="Your full name">{(id) => <Input id={id} />}</Field>);
    expect(screen.getByText("Your full name")).toBeInTheDocument();
  });
  it("Toggle is an accessible switch", async () => {
    const onChange = vi.fn();
    function Harness() {
      const [on, setOn] = useState(false);
      return <Toggle label="Pretty print" checked={on} onCheckedChange={(v) => (setOn(v), onChange(v))} />;
    }
    render(<Harness />);
    const sw = screen.getByRole("switch", { name: "Pretty print" });
    expect(sw).not.toBeChecked();
    await userEvent.click(sw);
    expect(sw).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByText("Pretty print")); // label click toggles too
    expect(sw).not.toBeChecked();
  });
  it("SegmentedControl behaves as a radio group", async () => {
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
    expect(screen.getByRole("radiogroup", { name: "Mode" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Alpha" })).toBeChecked();
    await userEvent.click(screen.getByText("Beta"));
    expect(screen.getByRole("radio", { name: "Beta" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Alpha" })).not.toBeChecked();
  });
  it("Select exposes options", async () => {
    render(
      <Select aria-label="Format" defaultValue="x">
        <option value="x">X</option>
        <option value="y">Y</option>
      </Select>,
    );
    await userEvent.selectOptions(screen.getByLabelText("Format"), "y");
    expect(screen.getByLabelText("Format")).toHaveValue("y");
  });
});

describe("display components", () => {
  it("Alert uses role=alert for errors and status otherwise", () => {
    const { rerender } = render(<Alert tone="error">Broken</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent("Broken");
    rerender(<Alert tone="info" title="Heads up">Details</Alert>);
    expect(screen.getByRole("status")).toHaveTextContent("Heads up");
  });
  it("renders Badge and Stat", () => {
    render(
      <>
        <Badge tone="primary">New</Badge>
        <dl>
          <Stat label="Words" value={42} />
        </dl>
      </>,
    );
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("Words")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});

describe("clipboard and download buttons", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  it("CopyButton copies and confirms", async () => {
    render(<CopyButton text="hello" />);
    await userEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("hello");
    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("Copied"));
  });
  it("CopyButton is disabled when there is nothing to copy", () => {
    render(<CopyButton text="" />);
    expect(screen.getByRole("button")).toBeDisabled();
  });
  it("copyText falls back to execCommand when the Clipboard API fails", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    document.execCommand = vi.fn().mockReturnValue(true);
    expect(await copyText("x")).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  describe("downloads", () => {
    let createObjectURL: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      createObjectURL = vi.fn().mockReturnValue("blob:mock");
      URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
      URL.revokeObjectURL = vi.fn();
    });
    afterEach(() => vi.restoreAllMocks());

    it("downloadBlob creates a link with the filename", () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      downloadBlob("data", "file.txt", "text/plain");
      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
    });
    it("DownloadButton triggers a download and is disabled for empty data", async () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const { rerender } = render(<DownloadButton data="abc" filename="a.txt" />);
      await userEvent.click(screen.getByRole("button", { name: /download/i }));
      expect(click).toHaveBeenCalledOnce();
      rerender(<DownloadButton data="" filename="a.txt" />);
      expect(screen.getByRole("button")).toBeDisabled();
    });
  });
});

describe("file helpers", () => {
  it("matches accept rules by extension, wildcard and mime", () => {
    const png = { name: "Photo.PNG", type: "image/png" };
    expect(matchesAccept(png, ".png")).toBe(true);
    expect(matchesAccept(png, "image/*")).toBe(true);
    expect(matchesAccept(png, "image/png, .jpg")).toBe(true);
    expect(matchesAccept(png, ".pdf,application/pdf")).toBe(false);
    expect(matchesAccept(png, undefined)).toBe(true);
  });
  it("formats sizes and names", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(baseName("report.final.pdf")).toBe("report.final");
    expect(baseName(".gitignore")).toBe(".gitignore");
    expect(fileExtension("a/b/Photo.JPEG")).toBe("jpeg");
    expect(fileExtension("noext")).toBe("");
  });
});

describe("FileDropzone", () => {
  const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });

  it("passes accepted files to onFiles via the input", async () => {
    const onFiles = vi.fn();
    render(<FileDropzone onFiles={onFiles} accept=".pdf" />);
    await userEvent.upload(screen.getByLabelText(/drop a file/i), file("a.pdf", "application/pdf"));
    expect(onFiles).toHaveBeenCalledOnce();
    expect(onFiles.mock.calls[0]?.[0][0].name).toBe("a.pdf");
  });
  it("rejects wrong types and oversize files with a message", async () => {
    const onFiles = vi.fn();
    const onReject = vi.fn();
    render(<FileDropzone onFiles={onFiles} onReject={onReject} accept="image/*" maxSizeMB={1} multiple />);
    const input = screen.getByLabelText(/drop a file/i);
    await userEvent.upload(input, [file("a.txt", "text/plain"), file("big.png", "image/png", 2 * 1024 * 1024), file("ok.png", "image/png")], { applyAccept: false });
    expect(onFiles.mock.calls[0]?.[0].map((f: File) => f.name)).toEqual(["ok.png"]);
    expect(onReject.mock.calls[0]?.[0]).toMatch(/a\.txt is not a supported file type.*big\.png is larger than 1 MB/);
  });
  it("only takes the first file unless multiple", async () => {
    const onFiles = vi.fn();
    render(<FileDropzone onFiles={onFiles} />);
    const input = screen.getByLabelText(/drop a file/i);
    await userEvent.upload(input, [file("1.txt", "text/plain"), file("2.txt", "text/plain")]);
    expect(onFiles.mock.calls[0]?.[0]).toHaveLength(1);
  });
  it("accepts dropped files", () => {
    const onFiles = vi.fn();
    const { container } = render(<FileDropzone onFiles={onFiles} />);
    const zone = container.firstElementChild as HTMLElement;
    const dropped = file("d.txt", "text/plain");
    zone.dispatchEvent(Object.assign(new Event("drop", { bubbles: true, cancelable: true }), { dataTransfer: { files: [dropped] } }));
    expect(onFiles).toHaveBeenCalledWith([dropped]);
  });
});

describe("FileListItem", () => {
  it("shows details and a remove button", async () => {
    const onRemove = vi.fn();
    render(
      <ul>
        <FileListItem name="doc.pdf" size={2048} detail="3 pages" onRemove={onRemove} />
      </ul>,
    );
    expect(screen.getByText("2.0 KB · 3 pages")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove doc.pdf" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
