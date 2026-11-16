import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString, degrees, type PDFRef } from "pdf-lib";
import { mergeDocuments, sequenceFromFiles, type MergeEntry } from "../src/pdf-merge";
import { fileNameFromTitle, readOutline, writeOutline, type NewOutlineItem, type OutlineItem } from "../src/pdf-outline";
import { bookmarkStarts, planSplit, splitDocument } from "../src/pdf-split";

/** A file whose pages are told apart by their width: file `id`'s page k is (id*100 + k) points wide. */
async function makeFile(id: number, pages: number, build?: (doc: PDFDocument) => void | Promise<void>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let k = 0; k < pages; k++) doc.addPage([id * 100 + k, 400]);
  await build?.(doc);
  return doc.save();
}

const widths = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()));
const rotations = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getRotation().angle);

/** The bookmark tree as titles and one-based pages, easy to compare. */
const shape = (items: OutlineItem[]): unknown[] => items.map((it) => (it.children.length ? [it.title, it.page === null ? null : it.page + 1, shape(it.children)] : [it.title, it.page === null ? null : it.page + 1]));

/** Chapters with sections, written with writeOutline. */
async function withChapters(pages = 10): Promise<Uint8Array> {
  return makeFile(3, pages, (doc) => {
    const p = doc.getPages().map((x) => x.ref);
    const items: NewOutlineItem[] = [
      { title: "Introduction", pageRef: p[0] as PDFRef, children: [] },
      { title: "Chapter 1: Getting started", pageRef: p[2] as PDFRef, children: [{ title: "1.1 Install", pageRef: p[3] as PDFRef, children: [] }] },
      { title: "Chapter 2", pageRef: p[6] as PDFRef, children: [{ title: "2.1 Use", pageRef: p[7] as PDFRef, children: [] }] },
    ];
    writeOutline(doc, items);
  });
}

describe("bookmarks", () => {
  it("writes a nested tree and reads it back", async () => {
    const doc = await PDFDocument.load(await withChapters());
    expect(shape(readOutline(doc))).toEqual([
      ["Introduction", 1],
      ["Chapter 1: Getting started", 3, [["1.1 Install", 4]]],
      ["Chapter 2", 7, [["2.1 Use", 8]]],
    ]);
    const outlines = doc.catalog.lookup(PDFName.of("Outlines"), PDFDict);
    expect(outlines.get(PDFName.of("Count"))?.toString()).toBe("5");
    expect(doc.catalog.get(PDFName.of("PageMode"))).toBe(PDFName.of("UseOutlines"));
  });

  it("follows named destinations (in a name tree with kids, and the old Dests dictionary) and GoTo actions", async () => {
    const bytes = await makeFile(1, 5, (doc) => {
      const ctx = doc.context;
      const pages = doc.getPages().map((p) => p.ref);
      const leaf = ctx.obj({ Limits: [PDFString.of("a"), PDFString.of("m")], Names: [PDFString.of("chap-b"), ctx.obj([pages[3], PDFName.of("Fit")])] });
      const tree = ctx.obj({ Kids: [ctx.register(ctx.obj({ Limits: [PDFString.of("n"), PDFString.of("z")], Names: [] })), ctx.register(leaf)] });
      doc.catalog.set(PDFName.of("Names"), ctx.obj({ Dests: tree }));
      doc.catalog.set(PDFName.of("Dests"), ctx.obj({ old: ctx.obj({ D: [pages[4], PDFName.of("Fit")] }) }));
      const root = ctx.nextRef();
      const a = ctx.nextRef();
      const b = ctx.nextRef();
      const c = ctx.nextRef();
      ctx.assign(a, ctx.obj({ Title: PDFHexString.fromText("Named"), Parent: root, Next: b, Dest: PDFString.of("chap-b") }));
      ctx.assign(b, ctx.obj({ Title: PDFHexString.fromText("Action"), Parent: root, Prev: a, Next: c, A: ctx.obj({ S: "GoTo", D: [pages[1], "XYZ", 0, 400, null] }) }));
      // A loop back to the first item must not hang the reader.
      ctx.assign(c, ctx.obj({ Title: PDFHexString.fromText("Old style"), Parent: root, Prev: b, Dest: PDFName.of("old"), Next: a }));
      ctx.assign(root, ctx.obj({ Type: "Outlines", First: a, Last: c, Count: 3 }));
      doc.catalog.set(PDFName.of("Outlines"), root);
    });
    const outline = readOutline(await PDFDocument.load(bytes));
    expect(shape(outline)).toEqual([
      ["Named", 4],
      ["Action", 2],
      ["Old style", 5],
    ]);
    expect(outline[1]?.view.map(String)).toEqual(["/XYZ", "0", "400", "null"]);
  });

  it("makes file names from titles", () => {
    expect(fileNameFromTitle("Chapter 1: Getting started")).toBe("chapter-1-getting-started");
    expect(fileNameFromTitle("Ça déjà vu!")).toBe("ca-deja-vu");
    expect(fileNameFromTitle("???")).toBe("part");
  });
});

describe("sequenceFromFiles", () => {
  it("lists each file's chosen pages, file after file", () => {
    expect(sequenceFromFiles([{ pageCount: 2 }, { pageCount: 3, pages: [2, 0] }])).toEqual([
      { file: 0, page: 0 },
      { file: 0, page: 1 },
      { file: 1, page: 2 },
      { file: 1, page: 0 },
    ]);
  });

  it("adds a blank page after a file that ends on a left-hand page, for double-sided printing", () => {
    const seq = sequenceFromFiles([{ pageCount: 3 }, { pageCount: 1 }, { pageCount: 2 }], true);
    expect(seq.map((e) => ("blank" in e ? "blank" : `${e.file}:${e.page}`))).toEqual(["0:0", "0:1", "0:2", "blank", "1:0", "blank", "2:0", "2:1"]);
  });
});

describe("mergeDocuments", () => {
  it("puts any pages of any files in any order, turned and with blank pages the size of the page before", async () => {
    const files = [
      { name: "a.pdf", bytes: await makeFile(1, 3) },
      { name: "b.pdf", bytes: await makeFile(2, 2) },
    ];
    const seq: MergeEntry[] = [{ file: 1, page: 1 }, { file: 0, page: 0, turn: 90 }, { blank: true }, { file: 0, page: 2, turn: -90 }, { file: 0, page: 0 }];
    const result = await mergeDocuments(files, seq);
    expect(await widths(result.data)).toEqual([201, 100, 100, 102, 100]);
    expect(await rotations(result.data)).toEqual([0, 90, 90, 270, 0]);
    expect(result).toMatchObject({ pages: 5, blanks: 1 });
  });

  it("keeps a page's own turn and adds to it", async () => {
    const bytes = await makeFile(1, 1, (doc) => void doc.getPage(0).setRotation(degrees(180)));
    const result = await mergeDocuments([{ name: "a.pdf", bytes }], [{ file: 0, page: 0, turn: 90 }]);
    expect(await rotations(result.data)).toEqual([270]);
  });

  it("adds a bookmark per file with each file's own bookmarks inside, pointing at the merged pages", async () => {
    const files = [
      { name: "Cover letter.pdf", bytes: await makeFile(1, 2) },
      { name: "manual.PDF", bytes: await withChapters() },
    ];
    const seq = sequenceFromFiles([{ pageCount: 2 }, { pageCount: 10, pages: [0, 1, 2, 3, 4, 5] }]);
    const result = await mergeDocuments(files, seq, { bookmarkPerFile: true, keepBookmarks: true });
    const outline = readOutline(await PDFDocument.load(result.data));
    // Chapter 2 starts on a page that was left out, so it keeps its title only if a child survives; here none does.
    expect(shape(outline)).toEqual([
      ["Cover letter", 1],
      ["manual", 3, [["Introduction", 3], ["Chapter 1: Getting started", 5, [["1.1 Install", 6]]]]],
    ]);
  });

  it("keeps the files' bookmarks at the top level without a bookmark per file, or leaves them out", async () => {
    const files = [
      { name: "a.pdf", bytes: await makeFile(1, 1) },
      { name: "b.pdf", bytes: await withChapters(8) },
    ];
    const seq = sequenceFromFiles([{ pageCount: 1 }, { pageCount: 8 }]);
    const kept = readOutline(await PDFDocument.load((await mergeDocuments(files, seq, { keepBookmarks: true })).data));
    expect(kept.map((i) => [i.title, (i.page ?? -1) + 1])).toEqual([
      ["Introduction", 2],
      ["Chapter 1: Getting started", 4],
      ["Chapter 2", 8],
    ]);
    const none = await PDFDocument.load((await mergeDocuments(files, seq, { keepBookmarks: false })).data);
    expect(readOutline(none)).toEqual([]);
  });

  it("keeps form fields fillable, renaming a field that another file also has", async () => {
    const form = (name: string) => async (doc: PDFDocument) => {
      const f = doc.getForm();
      f.createTextField("full_name").addToPage(doc.getPage(0), { x: 10, y: 10 });
      f.createCheckBox(name).addToPage(doc.getPage(0), { x: 10, y: 100 });
    };
    const files = [
      { name: "a.pdf", bytes: await makeFile(3, 1, form("agree")) },
      { name: "b.pdf", bytes: await makeFile(4, 1, form("subscribe")) },
    ];
    const result = await mergeDocuments(files, sequenceFromFiles([{ pageCount: 1 }, { pageCount: 1 }]));
    expect(result.renamedFields).toBe(1);
    const doc = await PDFDocument.load(result.data);
    const f = doc.getForm();
    expect(
      f
        .getFields()
        .map((x) => x.getName())
        .sort(),
    ).toEqual(["agree", "full_name", "full_name_2", "subscribe"]);
    f.getTextField("full_name_2").setText("Second file");
    f.getCheckBox("agree").check();
    const filled = await PDFDocument.load(await doc.save());
    expect(filled.getForm().getTextField("full_name_2").getText()).toBe("Second file");
    expect(filled.getForm().getTextField("full_name").getText()).toBeUndefined();

    const flat = await PDFDocument.load((await mergeDocuments(files, sequenceFromFiles([{ pageCount: 1 }, { pageCount: 1 }]), { keepForms: false })).data);
    expect(flat.catalog.get(PDFName.of("AcroForm"))).toBeUndefined();
  });

  it("can use one page twice", async () => {
    const result = await mergeDocuments([{ name: "a.pdf", bytes: await makeFile(1, 2) }], [{ file: 0, page: 1 }, { file: 0, page: 1 }]);
    expect(await widths(result.data)).toEqual([101, 101]);
  });

  it("refuses an empty merge and a page that does not exist", async () => {
    const files = [{ name: "a.pdf", bytes: await makeFile(1, 2) }];
    await expect(mergeDocuments(files, [{ blank: true }])).rejects.toThrow("There are no pages to merge.");
    await expect(mergeDocuments(files, [{ file: 0, page: 5 }])).rejects.toThrow("a.pdf has no page 6 (it has 2).");
    await expect(mergeDocuments([{ name: "bad.pdf", bytes: new Uint8Array([1, 2, 3]) }], [{ file: 0, page: 0 }])).rejects.toThrow(/bad\.pdf could not be read/);
  });
});

describe("planSplit", () => {
  const pages = (parts: { pages: number[] }[] | null) => parts?.map((p) => p.pages.map((x) => x + 1));

  it("plans every page, every N pages, ranges and chosen cuts", () => {
    expect(pages(planSplit({ type: "each" }, 3))).toEqual([[1], [2], [3]]);
    expect(pages(planSplit({ type: "every", pages: 2 }, 5))).toEqual([[1, 2], [3, 4], [5]]);
    expect(pages(planSplit({ type: "ranges", spec: "1-2; 5, 3" }, 5))).toEqual([[1, 2], [5, 3]]);
    expect(pages(planSplit({ type: "cuts", starts: [4, 2, 2, 0, 9] }, 6))).toEqual([[1, 2], [3, 4], [5, 6]]);
    expect(pages(planSplit({ type: "cuts", starts: [] }, 3))).toEqual([[1, 2, 3]]);
  });

  it("plans odd and even pages", () => {
    const parts = planSplit({ type: "odd-even" }, 5);
    expect(pages(parts)).toEqual([
      [1, 3, 5],
      [2, 4],
    ]);
    expect(parts?.map((p) => p.slug)).toEqual(["odd-pages", "even-pages"]);
    expect(pages(planSplit({ type: "odd-even" }, 1))).toEqual([[1]]);
  });

  it("plans a part per bookmark, with a part for pages before the first", async () => {
    const outline = readOutline(await PDFDocument.load(await withChapters()));
    const top = planSplit({ type: "bookmarks", level: 1 }, 10, outline);
    expect(top?.map((p) => [p.label, p.pages[0]! + 1, p.pages.length])).toEqual([
      ["Introduction", 1, 2],
      ["Chapter 1: Getting started", 3, 4],
      ["Chapter 2", 7, 4],
    ]);
    expect(planSplit({ type: "bookmarks", level: 2 }, 10, outline)?.map((p) => p.label)).toEqual(["Introduction", "Chapter 1: Getting started", "1.1 Install", "Chapter 2", "2.1 Use"]);
    const late: OutlineItem[] = [{ title: "Later", page: 3, view: [], children: [] }];
    expect(planSplit({ type: "bookmarks", level: 1 }, 5, late)?.map((p) => p.label)).toEqual(["Start", "Later"]);
    expect(bookmarkStarts([{ title: "A", page: 2, view: [], children: [] }, { title: "B", page: 2, view: [], children: [] }], 1)).toEqual([{ page: 2, title: "A" }]);
  });

  it("returns null for a split by size, and refuses what it cannot plan", () => {
    expect(planSplit({ type: "size", maxBytes: 1024 * 1024 }, 4)).toBeNull();
    expect(() => planSplit({ type: "size", maxBytes: 100 }, 4)).toThrow(/at least 20 KB/);
    expect(() => planSplit({ type: "every", pages: 0 }, 4)).toThrow(/positive whole number/);
    expect(() => planSplit({ type: "ranges", spec: " ; " }, 4)).toThrow(/at least one range/);
    expect(() => planSplit({ type: "bookmarks", level: 1 }, 4, [])).toThrow("This PDF has no bookmarks that point to its pages.");
    expect(() => planSplit({ type: "each" }, 3000)).toThrow(/At most 2000/);
  });
});

/** A file whose pages are each about `kb` kilobytes, with content that does not compress. */
async function heavyFile(pageKbs: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256).toString(16).padStart(2, "0");
  for (const kb of pageKbs) {
    const page = doc.addPage([300, 300]);
    const noise = Array.from({ length: kb * 512 }, random).join("");
    page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream(`% ${noise}\n0 0 10 10 re f`)));
  }
  return doc.save({ useObjectStreams: false });
}

describe("splitDocument", () => {
  it("names parts after their bookmarks, and each part keeps the bookmarks inside it", async () => {
    const { parts } = await splitDocument(await withChapters(), { type: "bookmarks", level: 1 }, "manual");
    expect(parts.map((p) => p.name)).toEqual(["manual-1-introduction.pdf", "manual-2-chapter-1-getting-started.pdf", "manual-3-chapter-2.pdf"]);
    expect(parts.map((p) => p.label)).toEqual(["Introduction", "Chapter 1: Getting started", "Chapter 2"]);
    const second = await PDFDocument.load(parts[1]!.data);
    expect(second.getPageCount()).toBe(4);
    expect(shape(readOutline(second))).toEqual([["Chapter 1: Getting started", 1, [["1.1 Install", 2]]]]);
  });

  it("splits into parts that each fit the size, in page order, covering every page", async () => {
    const bytes = await heavyFile(Array.from({ length: 12 }, () => 10));
    const max = 45 * 1024;
    const seen: number[] = [];
    const { parts, oversized } = await splitDocument(bytes, { type: "size", maxBytes: max }, "big", { onProgress: (p) => seen.push(p.done) });
    expect(oversized).toBe(0);
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts) expect(p.data.length).toBeLessThanOrEqual(max);
    expect(parts.flatMap((p) => p.pages)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    // Greedy: a part plus the next page would not have fit.
    expect(parts[0]!.pages.length).toBeGreaterThanOrEqual(3);
    expect(seen.length).toBeGreaterThan(0);
  });

  it("puts a page bigger than the limit in a part of its own and counts it", async () => {
    const { parts, oversized } = await splitDocument(await heavyFile([5, 60, 5]), { type: "size", maxBytes: 30 * 1024 }, "x");
    expect(oversized).toBe(1);
    expect(parts.map((p) => p.pages)).toEqual([[1], [2], [3]]);
  });

  it("makes odd and even page files with readable names", async () => {
    const { parts } = await splitDocument(await makeFile(1, 5), { type: "odd-even" }, "scan");
    expect(parts.map((p) => p.name)).toEqual(["scan-1-odd-pages.pdf", "scan-2-even-pages.pdf"]);
    expect(await widths(parts[1]!.data)).toEqual([101, 103]);
  });

  it("stops when asked", async () => {
    const stop = new AbortController();
    stop.abort();
    await expect(splitDocument(await makeFile(1, 3), { type: "each" }, "x", { signal: stop.signal })).rejects.toThrow("Stopped");
  });

  it("drops bookmarks when asked", async () => {
    const { parts } = await splitDocument(await withChapters(), { type: "every", pages: 5 }, "m", { keepBookmarks: false });
    expect(readOutline(await PDFDocument.load(parts[0]!.data))).toEqual([]);
  });
});
