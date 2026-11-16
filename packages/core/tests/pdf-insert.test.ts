import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFString, StandardFonts, degrees, type PDFRef } from "pdf-lib";
import { alternatePdfs, alternateSequence, cleanGaps, gapsEvery, halves, insertPages, insertSequence } from "../src/pdf-insert";
import { mergeDocuments, type MergeEntry } from "../src/pdf-merge";
import { readOutline, writeOutline } from "../src/pdf-outline";

/** File `id`'s page k is (id*100 + k) points wide, so pages can be told apart. */
async function makeFile(id: number, pages: number, build?: (doc: PDFDocument) => void | Promise<void>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let k = 0; k < pages; k++) doc.addPage([id * 100 + k, 400]);
  await build?.(doc);
  return doc.save();
}

const load = (bytes: Uint8Array) => PDFDocument.load(bytes);
const widths = async (bytes: Uint8Array) => (await load(bytes)).getPages().map((p) => Math.round(p.getWidth()));
/** Sequence entries written short: "0:2" for file 0 page 2, "b" for a blank. */
const short = (seq: MergeEntry[]) => seq.map((e) => ("blank" in e ? "b" : `${e.file}:${e.page}`));

describe("gaps", () => {
  it("lists the gaps after every n pages, including after the last page when it ends a group", () => {
    expect(gapsEvery(6, 1)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(gapsEvery(6, 2)).toEqual([2, 4, 6]);
    expect(gapsEvery(7, 3)).toEqual([3, 6]);
    expect(gapsEvery(2, 5)).toEqual([]);
    expect(() => gapsEvery(5, 0)).toThrow(/1 or more/);
  });

  it("cleans gaps: in order, once each, inside the document", () => {
    expect(cleanGaps([3, 0, 3, 9, -1, 1.5, 5], 5)).toEqual([0, 3, 5]);
  });
});

describe("insertSequence", () => {
  it("puts blanks at the start, between pages and at the end, and reports where they went", () => {
    const plan = insertSequence(3, [0, 2, 3], { blank: { count: 1 } });
    expect(short(plan.sequence)).toEqual(["b", "0:0", "0:1", "b", "0:2", "b"]);
    expect(plan.inserted).toEqual([0, 3, 5]);
  });

  it("matches a blank to the page before it, or the first page at the start", () => {
    const plan = insertSequence(2, [0, 2], { blank: { count: 2 } });
    expect(plan.sequence.filter((e) => "blank" in e)).toEqual([
      { blank: true, like: { file: 0, page: 0 } },
      { blank: true, like: { file: 0, page: 0 } },
      { blank: true, like: { file: 0, page: 1 } },
      { blank: true, like: { file: 0, page: 1 } },
    ]);
  });

  it("inserts pages of the second file, in the order given, at each gap", () => {
    expect(short(insertSequence(2, [1, 2], { pages: [2, 0] }).sequence)).toEqual(["0:0", "1:2", "1:0", "0:1", "1:2", "1:0"]);
  });
});

describe("insertPages", () => {
  it("adds blank pages the size of their neighbour, or a size of their own", async () => {
    const doc = await makeFile(5, 3);
    const matched = await insertPages({ bytes: doc, name: "a.pdf", pageCount: 3 }, { gaps: [0, 2], insertion: { blank: { count: 1 } } });
    expect(await widths(matched.data)).toEqual([500, 500, 501, 501, 502]);
    expect(matched.inserted).toBe(2);
    const a4 = await insertPages({ bytes: doc, name: "a.pdf", pageCount: 3 }, { gaps: [3], insertion: { blank: { count: 2, size: { width: 595.28, height: 841.89 } } } });
    const out = await load(a4.data);
    expect(out.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())])).toEqual([
      [500, 400],
      [501, 400],
      [502, 400],
      [595, 842],
      [595, 842],
    ]);
  });

  it("gives a matched blank the turn of the page next to it", async () => {
    const doc = await makeFile(5, 2, (d) => void d.getPage(1).setRotation(degrees(90)));
    const out = await load((await insertPages({ bytes: doc, name: "a.pdf", pageCount: 2 }, { gaps: [2], insertion: { blank: { count: 1 } } })).data);
    expect(out.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90, 90]);
  });

  it("inserts pages from another PDF and keeps the document's bookmarks and details", async () => {
    const doc = await makeFile(5, 4, (d) => {
      d.setTitle("Annual report");
      d.setAuthor("Finance");
      d.catalog.set(PDFName.of("Lang"), PDFString.of("en-GB"));
      const p = d.getPages().map((x) => x.ref);
      writeOutline(d, [
        { title: "Start", pageRef: p[0] as PDFRef, children: [] },
        { title: "Results", pageRef: p[2] as PDFRef, children: [] },
      ]);
    });
    const other = await makeFile(9, 3);
    const result = await insertPages({ bytes: doc, name: "report.pdf", pageCount: 4 }, { gaps: [2], insertion: { pages: [0, 2] }, from: { bytes: other, name: "charts.pdf" } });
    const out = await load(result.data);
    expect(out.getPages().map((p) => Math.round(p.getWidth()))).toEqual([500, 501, 900, 902, 502, 503]);
    expect(out.getTitle()).toBe("Annual report");
    expect(out.getAuthor()).toBe("Finance");
    expect(out.catalog.lookup(PDFName.of("Lang"), PDFString).decodeText()).toBe("en-GB");
    expect(readOutline(out).map((it) => [it.title, (it.page ?? -1) + 1])).toEqual([
      ["Start", 1],
      ["Results", 5],
    ]);
  });

  it("stores a page inserted after every page only once", async () => {
    const doc = await makeFile(5, 40);
    const other = await PDFDocument.create();
    const font = await other.embedFont(StandardFonts.Helvetica);
    const page = other.addPage([300, 400]);
    for (let k = 0; k < 40; k++) page.drawText(`Notes line ${k} `.repeat(6), { x: 10, y: 10 + k * 9, size: 7, font });
    const otherBytes = await other.save();
    const once = await insertPages({ bytes: doc, name: "a.pdf", pageCount: 40 }, { gaps: [40], insertion: { pages: [0] }, from: { bytes: otherBytes, name: "notes.pdf" } });
    const every = await insertPages({ bytes: doc, name: "a.pdf", pageCount: 40 }, { gaps: gapsEvery(40, 1), insertion: { pages: [0] }, from: { bytes: otherBytes, name: "notes.pdf" } });
    const out = await load(every.data);
    expect(out.getPageCount()).toBe(80);
    // 39 more pages, each a small page object pointing at the same content: far less than 39 copies of the text.
    expect(every.data.length - once.data.length).toBeLessThan(39 * 200);
    const contents = new Set(out.getPages().filter((_, i) => i % 2 === 1).map((p) => p.node.get(PDFName.of("Contents"))?.toString()));
    expect(contents.size).toBe(1);
  });

  it("gives each copy of a page with a form field its own field", async () => {
    const doc = await makeFile(5, 2);
    const other = await PDFDocument.create();
    const form = other.getForm();
    form.createTextField("initials").addToPage(other.addPage([300, 400]), { x: 20, y: 20, width: 100, height: 20 });
    const result = await insertPages({ bytes: doc, name: "a.pdf", pageCount: 2 }, { gaps: [1, 2], insertion: { pages: [0] }, from: { bytes: await other.save(), name: "sign.pdf" } });
    const names = (await load(result.data)).getForm().getFields().map((f) => f.getName());
    expect(names).toEqual(["initials", "initials_2"]);
    expect(result.renamedFields).toBe(1);
  });

  it("explains what is missing", async () => {
    const doc = { bytes: await makeFile(5, 2), name: "a.pdf", pageCount: 2 };
    await expect(insertPages(doc, { gaps: [], insertion: { blank: { count: 1 } } })).rejects.toThrow(/where to insert/);
    await expect(insertPages(doc, { gaps: [1], insertion: { blank: { count: 0 } } })).rejects.toThrow(/between 1 and 50/);
    await expect(insertPages(doc, { gaps: [1], insertion: { pages: [0] } })).rejects.toThrow(/Add the PDF/);
    await expect(insertPages(doc, { gaps: [1], insertion: { pages: [5] }, from: { bytes: await makeFile(9, 2), name: "b.pdf" } })).rejects.toThrow(/b\.pdf has no page 6/);
  });
});

describe("Alternate & Mix", () => {
  it("interleaves fronts with backs scanned in reverse", () => {
    expect(short(alternateSequence([{ pageCount: 3 }, { pageCount: 3, reverse: true }]))).toEqual(["0:0", "1:2", "0:1", "1:1", "0:2", "1:0"]);
  });

  it("puts the rest of a longer file at the end", () => {
    expect(short(alternateSequence([{ pageCount: 4 }, { pageCount: 2 }]))).toEqual(["0:0", "1:0", "0:1", "1:1", "0:2", "0:3"]);
  });

  it("takes several pages at a time and mixes more than two files", () => {
    expect(short(alternateSequence([{ pageCount: 4, take: 2 }, { pageCount: 2 }, { pageCount: 1 }]))).toEqual(["0:0", "0:1", "1:0", "2:0", "0:2", "0:3", "1:1"]);
  });

  it("uses chosen pages, and one file can feed two sources", () => {
    const { fronts, backs } = halves(5);
    expect([fronts, backs]).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
    expect(short(alternateSequence([{ file: 0, pageCount: 5, pages: fronts }, { file: 0, pageCount: 5, pages: backs, reverse: true }]))).toEqual(["0:0", "0:4", "0:1", "0:3", "0:2"]);
  });

  it("makes the mixed file", async () => {
    const fronts = await makeFile(1, 3, (d) => d.setTitle("Scan"));
    const backs = await makeFile(2, 3);
    const result = await alternatePdfs(
      [
        { bytes: fronts, name: "fronts.pdf" },
        { bytes: backs, name: "backs.pdf" },
      ],
      [{ pageCount: 3 }, { pageCount: 3, reverse: true }],
    );
    expect(await widths(result.data)).toEqual([100, 202, 101, 201, 102, 200]);
    expect((await load(result.data)).getTitle()).toBe("Scan");
  });

  it("mixes the halves of a single file", async () => {
    const one = await makeFile(1, 6);
    const { fronts, backs } = halves(6);
    const result = await alternatePdfs([{ bytes: one, name: "scan.pdf" }], [
      { file: 0, pageCount: 6, pages: fronts },
      { file: 0, pageCount: 6, pages: backs, reverse: true },
    ]);
    expect(await widths(result.data)).toEqual([100, 105, 101, 104, 102, 103]);
  });

  it("refuses an empty mix or a missing file", async () => {
    await expect(alternatePdfs([{ bytes: await makeFile(1, 1), name: "a.pdf" }], [{ pageCount: 1, pages: [] }])).rejects.toThrow(/no pages/);
    await expect(alternatePdfs([{ bytes: await makeFile(1, 1), name: "a.pdf" }], [{ pageCount: 1 }, { pageCount: 1 }])).rejects.toThrow(/missing/);
  });
});

describe("merge blanks", () => {
  it("keeps the old rule: a blank without a size copies the page before it", async () => {
    const bytes = await makeFile(3, 2);
    const result = await mergeDocuments([{ bytes, name: "a.pdf" }], [{ file: 0, page: 1 }, { blank: true }, { file: 0, page: 0 }]);
    expect(await widths(result.data)).toEqual([301, 301, 300]);
  });
});
