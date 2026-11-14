#!/usr/bin/env node
/**
 * Dark-theme, full-resolution screenshots of the PDF tools for social posts, plus a network privacy check.
 *
 *   pnpm run build && pnpm start          # production server on :3000, leave it running
 *   node scripts/social-shots.mjs [baseUrl] [outDir]
 *
 * Output (default social-shots/, git-ignored):
 *   <tool-slug>-<state>.png      1600x1000 viewport at 2x, scrolled to the top (16:10, top-aligned)
 *   <name>--scrolled.png         only when the key element is below the fold in the top-aligned shot
 *   samples/                     generated PDFs and pictures
 *   downloads/<slug>/            the files each tool produced
 *   report.json                  everything the run measured
 *
 * For every tool the full flow runs (load, process, download) while every request is recorded.
 * Failures are recorded and reported, never worked around.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const out = process.argv[3] ?? join(root, "social-shots");
const samples = join(out, "samples");
const downloads = join(out, "downloads");
for (const d of [out, samples, join(samples, "images"), downloads]) mkdirSync(d, { recursive: true });

// pdf-lib is a dependency of packages/core and does not resolve from the repo root under pnpm.
const { PDFDocument, StandardFonts, rgb } = createRequire(join(root, "packages", "core", "package.json"))("pdf-lib");

const VIEW = { width: 1600, height: 1000 };

/* ------------------------------------------------------------------ sample files */

const INK = rgb(0.1, 0.12, 0.14);
const MUTED = rgb(0.38, 0.42, 0.45);
const TEAL = rgb(0.06, 0.3, 0.36);
const RULE = rgb(0.78, 0.8, 0.82);

function wrap(font, text, size, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

async function newSheet(meta) {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(meta.title);
  doc.setAuthor(meta.author);
  doc.setSubject(meta.subject);
  doc.setKeywords(meta.keywords.split(/,\s*/));
  doc.setCreator(meta.creator);
  doc.setProducer("Harbor & Pine document tools");
  doc.setCreationDate(new Date("2026-11-03T09:00:00Z"));
  doc.setModificationDate(new Date("2026-11-03T09:00:00Z"));
  const s = {
    doc,
    reg,
    bold,
    page: null,
    y: 0,
    newPage() {
      s.page = doc.addPage([612, 792]);
      s.y = 792 - 72;
      return s.page;
    },
    text(str, { size = 10.5, font = reg, color = INK, x = 72, width = 468, lead = 1.5, gap = 0 } = {}) {
      for (const line of wrap(font, str, size, width)) {
        s.page.drawText(line, { x, y: s.y, size, font, color });
        s.y -= size * lead;
      }
      s.y -= gap;
    },
  };
  return s;
}

async function makeInvoice() {
  const s = await newSheet({ title: "Invoice INV-2026-0418", author: "Harbor & Pine Studio", subject: "Invoice for brand and packaging work", keywords: "invoice, design, packaging", creator: "Harbor & Pine Billing" });
  const p = s.newPage();
  p.drawRectangle({ x: 0, y: 792 - 120, width: 612, height: 120, color: TEAL });
  p.drawText("Harbor & Pine Studio", { x: 72, y: 792 - 62, size: 24, font: s.bold, color: rgb(1, 1, 1) });
  p.drawText("Brand, packaging and web design", { x: 72, y: 792 - 84, size: 11, font: s.reg, color: rgb(0.8, 0.9, 0.92) });
  p.drawText("INVOICE", { x: 612 - 72 - s.bold.widthOfTextAtSize("INVOICE", 22), y: 792 - 62, size: 22, font: s.bold, color: rgb(1, 1, 1) });
  s.y = 792 - 160;
  const meta = [
    ["Invoice number", "INV-2026-0418"],
    ["Invoice date", "12 November 2026"],
    ["Due date", "12 December 2026"],
    ["Terms", "Net 30"],
  ];
  meta.forEach(([k, v], i) => {
    p.drawText(k, { x: 340, y: s.y - i * 16, size: 9.5, font: s.reg, color: MUTED });
    p.drawText(v, { x: 440, y: s.y - i * 16, size: 10.5, font: s.bold, color: INK });
  });
  p.drawText("BILL TO", { x: 72, y: s.y, size: 9, font: s.bold, color: MUTED });
  ["Northfield Coffee Roasters", "Accounts Payable", "48 Alder Row, Suite 3", "Brightwater"].forEach((line, i) => p.drawText(line, { x: 72, y: s.y - 16 - i * 15, size: 11, font: i === 0 ? s.bold : s.reg, color: INK }));
  s.y -= 120;

  const cols = [72, 330, 400, 472];
  const head = ["Description", "Qty", "Rate", "Amount"];
  p.drawRectangle({ x: 72, y: s.y - 6, width: 468, height: 24, color: rgb(0.93, 0.95, 0.96) });
  head.forEach((h, i) => {
    const w = s.bold.widthOfTextAtSize(h, 9.5);
    p.drawText(h, { x: i === 0 ? cols[i] + 8 : cols[i] + (i === 3 ? 68 - w : 60 - w), y: s.y + 2, size: 9.5, font: s.bold, color: INK });
  });
  s.y -= 30;
  const items = [
    ["Brand identity refresh: logo, colour and type system", "24 h", "95.00", "2,280.00"],
    ["Packaging label layouts (three bag sizes)", "3", "480.00", "1,440.00"],
    ["Website content migration and page templates", "14 h", "85.00", "1,190.00"],
    ["Product photography retouching", "40", "12.00", "480.00"],
  ];
  for (const row of items) {
    wrap(s.reg, row[0], 10.5, 240).forEach((line, i) => p.drawText(line, { x: cols[0] + 8, y: s.y - i * 14, size: 10.5, font: s.reg, color: INK }));
    row.slice(1).forEach((cell, i) => {
      const w = s.reg.widthOfTextAtSize(cell, 10.5);
      p.drawText(cell, { x: cols[i + 1] + (i === 2 ? 68 - w : 60 - w), y: s.y, size: 10.5, font: s.reg, color: INK });
    });
    s.y -= 34;
    p.drawLine({ start: { x: 72, y: s.y + 20 }, end: { x: 540, y: s.y + 20 }, thickness: 0.5, color: RULE });
  }
  s.y -= 4;
  const totals = [
    ["Subtotal", "5,390.00"],
    ["Sales tax (8%)", "431.20"],
  ];
  totals.forEach(([k, v], i) => {
    p.drawText(k, { x: 360, y: s.y - i * 18, size: 10.5, font: s.reg, color: MUTED });
    p.drawText(v, { x: 540 - s.reg.widthOfTextAtSize(v, 10.5), y: s.y - i * 18, size: 10.5, font: s.reg, color: INK });
  });
  s.y -= 48;
  p.drawRectangle({ x: 340, y: s.y - 8, width: 200, height: 32, color: TEAL });
  p.drawText("Total due (USD)", { x: 352, y: s.y + 2, size: 10.5, font: s.bold, color: rgb(1, 1, 1) });
  p.drawText("5,821.20", { x: 528 - s.bold.widthOfTextAtSize("5,821.20", 13), y: s.y + 1, size: 13, font: s.bold, color: rgb(1, 1, 1) });
  s.y -= 70;
  s.text("Payment", { font: s.bold, size: 11, gap: 2 });
  s.text("Pay by bank transfer within 30 days of the invoice date and quote INV-2026-0418 as the reference. Late balances accrue 1% interest per month, as set out in section 3 of the Services Agreement.", { color: MUTED, size: 10 });
  p.drawText("Thank you for working with us.", { x: 72, y: 56, size: 10, font: s.reg, color: MUTED });
  return s.doc.save();
}

async function makeContract() {
  const s = await newSheet({ title: "Services Agreement HP-2026-031", author: "Harbor & Pine Studio", subject: "Design services agreement", keywords: "agreement, services, design", creator: "Harbor & Pine Contracts" });
  const h = (t) => s.text(t, { font: s.bold, size: 11.5, gap: 1, color: TEAL });
  const body = (t) => s.text(t, { gap: 11 });

  s.newPage();
  s.text("Services Agreement", { font: s.bold, size: 26, lead: 1.25 });
  s.text("Agreement No. HP-2026-031  |  Effective 3 November 2026", { color: MUTED, size: 10, gap: 18 });
  s.page.drawLine({ start: { x: 72, y: s.y + 8 }, end: { x: 540, y: s.y + 8 }, thickness: 1, color: TEAL });
  s.y -= 10;
  body('This Services Agreement (the "Agreement") is made between Harbor & Pine Studio, a design studio (the "Studio"), and Northfield Coffee Roasters, a food and beverage company (the "Client"). The parties agree as follows.');
  h("1. Scope of Services");
  body("The Studio will provide the brand identity refresh, packaging label layouts and website content migration described in Schedule A. Work outside Schedule A is handled through a written change request that states the added work, its cost and its timing before it begins.");
  h("2. Deliverables and Schedule");
  body("The Studio will deliver the first design round within fifteen business days of receiving the Client's brief and brand assets. The Client will return consolidated written feedback within five business days of each delivery. A delay in feedback moves every later date by the same number of days.");
  h("3. Fees and Payment");
  body("The Client will pay fees of 5,390.00 USD before tax, in two instalments: 50 percent on signing and 50 percent on delivery of the final files. Invoices are due thirty days after the invoice date. Overdue amounts accrue interest at 1 percent per month.");
  h("4. Revisions");
  body("Each design round includes up to two rounds of revisions. Further rounds are billed at the Studio's hourly rate of 95.00 USD, and the Studio will give an estimate before starting them.");

  s.newPage();
  h("5. Ownership and Licence");
  body("On receipt of full payment, the Client owns the final approved artwork. The Studio keeps ownership of working files, sketches and unused concepts, and may show the finished work in its portfolio unless the Client asks in writing for it to be withheld.");
  h("6. Client Materials");
  body("The Client confirms it has the right to use all logos, photographs, text and other materials it provides, and will hold the Studio harmless from claims that arise from their use.");
  h("7. Confidentiality");
  body("Each party will keep the other's non-public information confidential, use it only for the purposes of this Agreement, and return or delete it on request. This duty continues for three years after the Agreement ends.");
  h("8. Warranties");
  body("The Studio will perform the services with reasonable skill and care. Except as stated in this Agreement, the services are provided without other warranties, express or implied.");
  h("9. Limitation of Liability");
  body("Neither party is liable for indirect or consequential loss. The Studio's total liability under this Agreement is limited to the fees paid in the twelve months before the claim arose.");

  s.newPage();
  h("10. Term and Termination");
  body("This Agreement runs until the services are delivered and paid for. Either party may end it with fourteen days' written notice. On termination the Client pays for all work completed up to the date of the notice.");
  h("11. General");
  body("This Agreement is the entire agreement between the parties on its subject and replaces earlier discussions. Changes must be in writing and signed by both parties. If a clause is found unenforceable, the rest remains in force.");
  h("12. Signatures");
  body("Signed by the parties' authorised representatives on the dates shown below.");
  // Signature lines sit at 84% of the page height from the top; the shot script aims the signature at this line.
  const lineY = 792 * (1 - 0.84);
  for (const [x, who] of [
    [72, "For Harbor & Pine Studio"],
    [340, "For Northfield Coffee Roasters"],
  ]) {
    s.page.drawText(who, { x, y: lineY + 96, size: 10.5, font: s.bold, color: INK });
    s.page.drawLine({ start: { x, y: lineY }, end: { x: x + 200, y: lineY }, thickness: 0.8, color: INK });
    s.page.drawText("Signature", { x, y: lineY - 13, size: 8.5, font: s.reg, color: MUTED });
    s.page.drawLine({ start: { x, y: lineY - 44 }, end: { x: x + 200, y: lineY - 44 }, thickness: 0.5, color: RULE });
    s.page.drawText("Name and title", { x, y: lineY - 57, size: 8.5, font: s.reg, color: MUTED });
    s.page.drawLine({ start: { x, y: lineY - 88 }, end: { x: x + 120, y: lineY - 88 }, thickness: 0.5, color: RULE });
    s.page.drawText("Date", { x, y: lineY - 101, size: 8.5, font: s.reg, color: MUTED });
  }
  return s.doc.save();
}

async function makeReport(jpegs) {
  const s = await newSheet({ title: "Coastal Trail Restoration: Q3 2026 Field Report", author: "Marrow Point Trail Trust", subject: "Quarterly field report", keywords: "trail, restoration, volunteers, report", creator: "Marrow Point Reporting" });
  const h = (t) => s.text(t, { font: s.bold, size: 14, gap: 3, color: TEAL, lead: 1.3 });
  const body = (t) => s.text(t, { gap: 10 });
  const image = async (bytes, y, width, caption) => {
    const img = await s.doc.embedJpg(bytes);
    const height = (img.height / img.width) * width;
    s.page.drawImage(img, { x: 72, y: y - height, width, height });
    s.page.drawText(caption, { x: 72, y: y - height - 14, size: 8.5, font: s.reg, color: MUTED });
    return height + 28;
  };

  s.newPage();
  s.page.drawRectangle({ x: 0, y: 792 - 230, width: 612, height: 230, color: TEAL });
  s.page.drawText("Coastal Trail Restoration", { x: 72, y: 792 - 120, size: 30, font: s.bold, color: rgb(1, 1, 1) });
  s.page.drawText("Third quarter field report, July to September 2026", { x: 72, y: 792 - 152, size: 13, font: s.reg, color: rgb(0.8, 0.9, 0.92) });
  s.page.drawText("Marrow Point Trail Trust", { x: 72, y: 792 - 196, size: 11, font: s.bold, color: rgb(1, 1, 1) });
  s.y = 792 - 280;
  h("Summary");
  body("Between July and September the restoration crew rebuilt 6.4 kilometres of the coastal path between the north car park and the lighthouse headland. Drainage was the main problem: after last winter's storms, water had cut channels across the path in eleven places, and in three of them the surface had slipped toward the cliff edge.");
  body("A total of 212 volunteers gave 1,840 hours over the quarter, supported by a paid crew of four. We installed 38 stone steps, 21 timber drainage bars and 640 metres of edging, and planted 3,150 native shrubs and grasses on the slopes above the path to hold the soil.");
  h("Highlights");
  ["Path reopened in full on 21 September, three weeks ahead of the plan.", "Volunteer hours rose 18 percent on the second quarter.", "No lost-time injuries across 41 working days.", "Plant survival in the first monitoring walk was 91 percent."].forEach((line) => s.text(`-  ${line}`, { x: 84, width: 450, gap: 3 }));

  s.newPage();
  h("Work completed");
  body("The crew worked from the lighthouse end back toward the car park, so the most exposed section was repaired while the weather was still settled. Each section followed the same sequence: clear and re-profile the tread, set drainage bars every 12 to 20 metres depending on the slope, then lay and compact a crushed stone surface.");
  const used = await image(jpegs[0], s.y + 4, 468, "Figure 1. The lighthouse section after resurfacing, looking south.");
  s.y -= used + 10;
  body("Stone for the steps was sourced from the old quarry wall two kilometres inland, which kept the colour of the new work close to the existing path. Timber was local larch, untreated, with a design life of roughly fifteen years in this exposure.");

  s.newPage();
  h("Volunteer effort by month");
  const months = [
    ["July", 520],
    ["August", 690],
    ["September", 630],
  ];
  const baseY = s.y - 150;
  s.page.drawLine({ start: { x: 72, y: baseY }, end: { x: 540, y: baseY }, thickness: 0.8, color: INK });
  months.forEach(([name, hours], i) => {
    const bh = (hours / 700) * 140;
    const x = 110 + i * 150;
    s.page.drawRectangle({ x, y: baseY, width: 80, height: bh, color: TEAL });
    s.page.drawText(String(hours), { x: x + 40 - s.bold.widthOfTextAtSize(String(hours), 11) / 2, y: baseY + bh + 6, size: 11, font: s.bold, color: INK });
    s.page.drawText(name, { x: x + 40 - s.reg.widthOfTextAtSize(name, 10) / 2, y: baseY - 16, size: 10, font: s.reg, color: MUTED });
  });
  s.y = baseY - 50;
  body("August was the busiest month, helped by two corporate volunteer days and a school group from the coastal villages. September hours dipped as the surface work finished and the crew moved to planting.");
  const used2 = await image(jpegs[1], s.y + 4, 400, "Figure 2. Volunteers planting the upper slope in September.");
  s.y -= used2;

  s.newPage();
  h("Conclusions and next steps");
  body("The path is now in better condition than at any point in the last decade, and the drainage work should prevent a repeat of last winter's damage. The main risk is the two culverts at the northern end, which are original and undersized.");
  body("Priorities for the fourth quarter are the northern culverts, a second monitoring walk of the new planting, and a handover guide so the council's rangers can maintain the drainage bars. The fourth quarter budget request of 14,200 USD is attached to the board pack.");
  h("Thanks");
  body("The Trust thanks every volunteer, the quarry owners for the stone, and the parish council for keeping the car park open to volunteer vehicles throughout the works.");
  return s.doc.save();
}

/** Landscape pictures made in the browser's canvas: no stock photos, no people, no orange. */
async function makePhotos(browser) {
  const page = await browser.newPage();
  await page.goto("about:blank");
  const paint = (spec) =>
    page.evaluate(({ w, h, seed, pal, grain, type, q }) => {
      let s = seed >>> 0;
      const rnd = () => {
        s |= 0;
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
      sky.addColorStop(0, pal.skyTop);
      sky.addColorStop(1, pal.skyLow);
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      const glow = g.createRadialGradient(w * pal.sunX, h * 0.36, 0, w * pal.sunX, h * 0.36, h * 0.38);
      glow.addColorStop(0, pal.sun);
      glow.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = glow;
      g.fillRect(0, 0, w, h);
      pal.hills.forEach((col, i) => {
        const baseY = h * (0.5 + i * 0.12);
        const amp = h * (0.1 - i * 0.015);
        const f1 = 1.5 + rnd() * 2;
        const f2 = 4 + rnd() * 4;
        const p1 = rnd() * 6;
        const p2 = rnd() * 6;
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w; x += 4) g.lineTo(x, baseY + Math.sin((x / w) * f1 * Math.PI * 2 + p1) * amp + Math.sin((x / w) * f2 * Math.PI * 2 + p2) * amp * 0.35);
        g.lineTo(w, h);
        g.closePath();
        g.fillStyle = col;
        g.fill();
      });
      const img = g.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (rnd() - 0.5) * grain;
        d[i] += n;
        d[i + 1] += n;
        d[i + 2] += n;
      }
      g.putImageData(img, 0, 0);
      return c.toDataURL(type, q).split(",")[1];
    }, spec);
  const A = { skyTop: "#4f86b8", skyLow: "#cfe3ee", sun: "rgba(255,250,235,0.9)", sunX: 0.7, hills: ["#7fa6a0", "#4f7f6f", "#2f5a4a", "#1d3a30"] };
  const B = { skyTop: "#7b8c99", skyLow: "#c9d3d8", sun: "rgba(245,247,248,0.8)", sunX: 0.3, hills: ["#8a9b94", "#5f766d", "#3d5650", "#243a35"] };
  const C = { skyTop: "#9cc3dd", skyLow: "#eef4f1", sun: "rgba(255,252,240,0.9)", sunX: 0.5, hills: ["#a9c4b4", "#7ba596", "#4d7d70", "#2c5149"] };
  const b64 = async (spec) => Buffer.from(await paint(spec), "base64");
  const result = {
    report: [await b64({ w: 2400, h: 1500, seed: 11, pal: A, grain: 34, type: "image/jpeg", q: 0.95 }), await b64({ w: 2000, h: 1300, seed: 29, pal: B, grain: 34, type: "image/jpeg", q: 0.95 })],
    images: [
      ["site-photo-1.jpg", await b64({ w: 1600, h: 1100, seed: 5, pal: A, grain: 22, type: "image/jpeg", q: 0.9 })],
      ["site-photo-2.jpg", await b64({ w: 1600, h: 1100, seed: 8, pal: B, grain: 22, type: "image/jpeg", q: 0.9 })],
      ["site-photo-3.png", await b64({ w: 1200, h: 800, seed: 13, pal: C, grain: 6, type: "image/png" })],
    ],
  };
  await page.close();
  return result;
}

/* ------------------------------------------------------------------ helpers */

const browser = await chromium.launch();
const photos = await makePhotos(browser);
const F = {
  invoice: join(samples, "invoice.pdf"),
  contract: join(samples, "contract.pdf"),
  report: join(samples, "report.pdf"),
  images: photos.images.map(([name]) => join(samples, "images", name)),
};
writeFileSync(F.invoice, await makeInvoice());
writeFileSync(F.contract, await makeContract());
writeFileSync(F.report, await makeReport(photos.report));
photos.images.forEach(([name, bytes]) => writeFileSync(join(samples, "images", name), bytes));
const sizeKB = (p) => Math.round(readFileSync(p).length / 1024);
console.log(`Samples: invoice ${sizeKB(F.invoice)} KB, contract ${sizeKB(F.contract)} KB, report ${sizeKB(F.report)} KB`);

function hostClass(url) {
  try {
    const u = new URL(url);
    if (!/^(https?|wss?):$/.test(u.protocol)) return "local-scheme";
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" ? "localhost" : "outside";
  } catch {
    return "local-scheme";
  }
}

/** Counts "PK\3\4" local headers and returns the entry names of a ZIP. */
function zipNames(buf) {
  const names = [];
  for (let i = 0; i + 30 < buf.length; i++) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x03 && buf[i + 3] === 0x04) {
      const len = buf.readUInt16LE(i + 26);
      names.push(buf.toString("utf8", i + 30, i + 30 + len));
    }
  }
  return names;
}

async function settle(page, ms = 700) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page
    .waitForFunction(() => {
      const e = document.querySelector('[data-testid="outside-requests"]');
      return !!e && e.textContent !== "…";
    }, null, { timeout: 10000 })
    .catch(() => {});
  await page.waitForTimeout(ms);
}

async function inViewAtTop(locator) {
  const box = await locator.first().boundingBox().catch(() => null);
  return !!box && box.y >= 0 && box.y + box.height <= VIEW.height;
}

/** Top-aligned viewport shot. If `key` is below the fold, a second shot scrolled just far enough to show it is saved too. */
async function shot(page, name, key) {
  await page.evaluate(() => {
    // The site sets smooth scrolling, so say "instant" or the shot is taken mid-animation.
    window.scrollTo({ top: 0, behavior: "instant" });
    document.activeElement?.blur?.();
  });
  await page.mouse.move(1590, 500); // outside the 1280px content column, so nothing is hovered
  await page.waitForTimeout(500);
  const counter = page.getByTestId("outside-requests");
  const counterVisible = (await counter.count()) > 0 && (await inViewAtTop(counter));
  const keyVisible = key ? await inViewAtTop(key) : true;
  await page.screenshot({ path: join(out, `${name}.png`) });
  const files = [`${name}.png`];
  if (key && !keyVisible) {
    const offset = await key.first().evaluate((el, vh) => Math.max(0, Math.round(el.getBoundingClientRect().bottom + window.scrollY + 40 - vh)), VIEW.height);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), offset);
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(out, `${name}--scrolled.png`) });
    files.push(`${name}--scrolled.png`);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  }
  return { name, files, keyVisibleAtTop: keyVisible, counterVisibleAtTop: counterVisible };
}

/* ------------------------------------------------------------------ the 15 tools */

const done = (p) => p.getByText("Done! Your file is ready.").waitFor({ timeout: 60000 });
const btn = (p, name, exact = false) => p.getByRole("button", { name, exact });
const thumbs = (p, n, scope = "body") =>
  p.waitForFunction(({ n, scope }) => document.querySelectorAll(`${scope} img[src^="blob:"]`).length >= n, { n, scope }, { timeout: 30000 });

/**
 * kind: pdf | zip | txt. `pages` / `entries` / `contains` are the expected result.
 * Each tool: upload files, waitLoaded, optional loadedShot, process, optional doneShot, download.
 */
const tools = [
  {
    slug: "merge-pdf",
    upload: [F.invoice, F.contract],
    waitLoaded: (p) => p.getByText("2. contract.pdf").waitFor(),
    loadedShot: "merge-pdf-loaded",
    loadedKey: (p) => btn(p, /^Merge 2 PDFs/),
    process: async (p) => (await btn(p, /^Merge 2 PDFs/).click(), done(p)),
    download: (p) => btn(p, "Download", true),
    expect: { kind: "pdf", pages: 4 },
  },
  {
    slug: "compress-pdf",
    upload: [F.report],
    waitLoaded: (p) => p.getByText("Images take").waitFor(),
    process: async (p) => {
      await btn(p, "Compress PDF", true).click();
      await p.getByTestId("compress-sizes").waitFor({ timeout: 90000 });
      await p.waitForTimeout(1500); // the before/after slider draws its pages
    },
    doneShot: "compress-pdf-done",
    doneKey: (p) => p.getByText("Your smaller file is ready."),
    download: (p) => btn(p, "Download", true),
    expect: { kind: "pdf", pages: 4 },
    extra: async (p) => ({ sizes: await p.getByTestId("compress-sizes").textContent() }),
  },
  {
    slug: "sign-pdf",
    upload: [F.contract],
    waitLoaded: (p) => p.getByText("1. Make your signature").waitFor(),
    afterLoad: async (p) => {
      await p.locator("label", { hasText: /^Type$/ }).click();
      await p.getByLabel("Your name").fill("Maren Holloway");
      await p.locator("label", { hasText: /^Blue$/ }).click();
      await p.getByTestId("signature-box").waitFor();
      await btn(p, "Next page").click();
      await btn(p, "Next page").click();
      await p.getByAltText("Page 3 of the PDF").waitFor({ timeout: 30000 });
      // Drag the signature down onto the right-hand signature line (84% of the page height).
      const boxLoc = p.getByTestId("signature-box");
      const stage = await boxLoc.locator("xpath=..").boundingBox();
      const box = await boxLoc.boundingBox();
      const dy = stage.y + stage.height * 0.84 - 6 - (box.y + box.height);
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await p.mouse.move(cx, cy);
      await p.mouse.down();
      await p.mouse.move(cx, cy + dy / 2, { steps: 8 });
      await p.mouse.move(cx, cy + dy, { steps: 8 });
      await p.mouse.up();
      await p.waitForTimeout(300);
    },
    loadedShot: "sign-pdf-placed",
    loadedKey: (p) => p.getByTestId("signature-box").locator("xpath=.."),
    process: async (p) => (await btn(p, /^Sign/).click(), done(p)),
    download: (p) => btn(p, "Download", true),
    expect: { kind: "pdf", pages: 3 },
  },
  {
    slug: "split-pdf",
    upload: [F.contract],
    waitLoaded: (p) => p.getByText("Every page").first().waitFor(),
    empty: "split-pdf-empty",
    loadedShot: "split-pdf-loaded",
    process: async (p) => (await btn(p, "Split PDF", true).click(), p.getByText("Created 3 files.").waitFor()),
    download: (p) => btn(p, "Download all (ZIP)"),
    expect: { kind: "zip", entries: 3 },
  },
  {
    slug: "pdf-organizer",
    upload: [F.report],
    waitLoaded: (p) => thumbs(p, 4, 'ol[aria-label="Pages of the new file"]'),
    empty: "pdf-organizer-empty",
    loadedShot: "pdf-organizer-loaded",
    process: async (p) => {
      await btn(p, "Move page 4, now at position 4 up", true).click();
      await btn(p, "Turn page 1, now at position 1 clockwise", true).click();
      await btn(p, "Create PDF", true).click();
      await done(p);
    },
    download: (p) => btn(p, "Download", true),
    expect: { kind: "pdf", pages: 4 },
  },
  {
    slug: "rotate-pdf",
    upload: [F.contract],
    waitLoaded: (p) => btn(p, "Rotate PDF", true).waitFor(),
    empty: "rotate-pdf-empty",
    loadedShot: "rotate-pdf-loaded",
    process: async (p) => (await btn(p, "Rotate PDF", true).click(), done(p)),
    download: (p) => btn(p, "Download", true),
    expect: { kind: "pdf", pages: 3 },
  },
  {
    slug: "delete-pdf-pages",
    upload: [F.report],
    waitLoaded: (p) => thumbs(p, 4),
    empty: "delete-pdf-pages-empty",
    loadedShot: "delete-pdf-pages-loaded",
    process: async (p) => (await btn(p, "Delete pages", true).click(), done(p)),
    download: (p) => btn(p, "Download", true),
    expect: { kind: "pdf", pages: 3 },
  },
  {
    slug: "extract-pdf-pages",
    upload: [F.report],
    waitLoaded: (p) => thumbs(p, 4),
    empty: "extract-pdf-pages-empty",
    loadedShot: "extract-pdf-pages-loaded",
    process: async (p) => (await btn(p, "Extract pages", true).click(), done(p)),
    download: (p) => btn(p, "Download", true),
    expect: { kind: "pdf", pages: 3 },
  },
  {
    slug: "extract-pdf-images",
    upload: [F.report],
    waitLoaded: (p) => btn(p, "Extract images", true).waitFor(),
    empty: "extract-pdf-images-empty",
    loadedShot: "extract-pdf-images-loaded",
    process: async (p) => (await btn(p, "Extract images", true).click(), p.getByText(/images? found/).waitFor({ timeout: 30000 })),
    download: (p) => btn(p, "Download all as ZIP"),
    expect: { kind: "zip", entries: 2 },
  },
  {
    slug: "pdf-to-images",
    upload: [F.report],
    waitLoaded: (p) => btn(p, "Make pictures", true).waitFor(),
    empty: "pdf-to-images-empty",
    loadedShot: "pdf-to-images-loaded",
    process: async (p) => (await btn(p, "Make pictures", true).click(), p.getByTestId("pictures-count").waitFor({ timeout: 90000 })),
    download: (p) => btn(p, "Download all as ZIP"),
    expect: { kind: "zip", entries: 4 },
  },
  {
    slug: "pdf-to-text",
    upload: [F.contract],
    waitLoaded: (p) => p.getByTestId("pdf-text-words").waitFor({ timeout: 30000 }),
    empty: "pdf-to-text-empty",
    loadedShot: "pdf-to-text-loaded",
    process: async () => {},
    download: (p) => btn(p, "Download .txt"),
    expect: { kind: "txt", contains: "Services Agreement" },
  },
  {
    slug: "pdf-page-numbers",
    upload: [F.contract],
    waitLoaded: (p) => btn(p, "Add page numbers", true).waitFor(),
    empty: "pdf-page-numbers-empty",
    loadedShot: "pdf-page-numbers-loaded",
    process: async (p) => (await btn(p, "Add page numbers", true).click(), done(p)),
    download: (p) => btn(p, "Download", true),
    expect: { kind: "pdf", pages: 3 },
  },
  {
    slug: "pdf-watermark",
    upload: [F.contract],
    waitLoaded: (p) => btn(p, "Add watermark", true).waitFor(),
    empty: "pdf-watermark-empty",
    loadedShot: "pdf-watermark-loaded",
    process: async (p) => (await btn(p, "Add watermark", true).click(), done(p)),
    download: (p) => btn(p, "Download", true),
    expect: { kind: "pdf", pages: 3 },
  },
  {
    slug: "pdf-metadata-editor",
    upload: [F.invoice],
    waitLoaded: async (p) => {
      await p.getByLabel("Title", { exact: true }).waitFor();
      await p.waitForFunction(() => document.querySelector('input[id]')?.value !== undefined && [...document.querySelectorAll("input")].some((i) => i.value.startsWith("Invoice INV")), null, { timeout: 15000 });
    },
    empty: "pdf-metadata-editor-empty",
    loadedShot: "pdf-metadata-editor-loaded",
    process: async (p) => (await btn(p, "Save changes", true).click(), done(p)),
    download: (p) => btn(p, "Download", true),
    expect: { kind: "pdf", pages: 1 },
  },
  {
    slug: "images-to-pdf",
    upload: F.images,
    waitLoaded: (p) => btn(p, "Create PDF from 3 images", true).waitFor(),
    empty: "images-to-pdf-empty",
    loadedShot: "images-to-pdf-loaded",
    process: async (p) => (await btn(p, "Create PDF from 3 images", true).click(), done(p)),
    download: (p) => btn(p, "Download", true),
    expect: { kind: "pdf", pages: 3 },
  },
];

/* ------------------------------------------------------------------ per-tool run */

const { PDFDocument: PD } = { PDFDocument };

async function runTool(tool) {
  const context = await browser.newContext({ viewport: VIEW, colorScheme: "dark", deviceScaleFactor: 2 });
  await context.addInitScript(() => localStorage.setItem("tw-theme", "dark"));
  const page = await context.newPage();

  let phase = "load-page";
  const ctxReqs = [];
  const pageReqs = new Set();
  const sockets = [];
  const describe = (r) => {
    const body = r.postDataBuffer();
    return { phase, method: r.method(), url: r.url(), type: r.resourceType(), host: hostClass(r.url()), bodyBytes: body ? body.length : 0 };
  };
  context.on("request", (r) => ctxReqs.push(describe(r)));
  page.on("request", (r) => pageReqs.add(r.url() + "|" + r.method()));
  page.on("websocket", (ws) => sockets.push(ws.url()));

  const res = { slug: tool.slug, shots: [], failures: [], download: null, counter: [], description: null, h1: null, files: [] };
  const step = async (name, fn) => {
    phase = name;
    try {
      return await fn();
    } catch (err) {
      res.failures.push({ step: name, message: String(err?.message ?? err).split("\n")[0] });
      return undefined;
    }
  };

  const ok1 = await step("open-page", async () => {
    await page.goto(`${base}/tools/${tool.slug}`, { waitUntil: "networkidle" });
    await page.locator('input[type="file"]').first().waitFor({ state: "attached" });
    await settle(page);
    res.h1 = (await page.locator("h1").first().textContent())?.trim();
    res.description = (await page.locator("h1 + p").first().textContent())?.trim();
    return true;
  });

  if (ok1 && tool.empty) {
    const r = await step("shot-empty", async () => shot(page, tool.empty));
    if (r) res.shots.push(r);
  }

  let loaded = false;
  if (ok1) {
    loaded = !!(await step("upload", async () => {
      await page.locator('input[type="file"]').first().setInputFiles(tool.upload);
      await tool.waitLoaded(page);
      if (tool.afterLoad) await tool.afterLoad(page);
      await settle(page, 900);
      return true;
    }));
  }

  if (loaded && tool.loadedShot) {
    const r = await step("shot-loaded", async () => shot(page, tool.loadedShot, tool.loadedKey?.(page)));
    if (r) res.shots.push(r);
  }

  let processed = false;
  if (loaded) {
    processed = !!(await step("process", async () => {
      await tool.process(page);
      await settle(page, 700);
      return true;
    }));
  }

  if (processed && tool.doneShot) {
    const r = await step("shot-done", async () => shot(page, tool.doneShot, tool.doneKey?.(page)));
    if (r) res.shots.push(r);
  }
  if (processed && tool.extra) res.extra = await step("extra", () => tool.extra(page));

  if (processed) {
    await step("download", async () => {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), tool.download(page).click()]);
      const dir = join(downloads, tool.slug);
      mkdirSync(dir, { recursive: true });
      const path = join(dir, dl.suggestedFilename());
      await dl.saveAs(path);
      const buf = readFileSync(path);
      const info = { file: dl.suggestedFilename(), bytes: buf.length, kind: tool.expect.kind };
      if (tool.expect.kind === "pdf") {
        const doc = await PD.load(buf);
        info.pages = doc.getPageCount();
        if (info.pages !== tool.expect.pages) throw new Error(`expected ${tool.expect.pages} pages, got ${info.pages}`);
      } else if (tool.expect.kind === "zip") {
        info.entries = zipNames(buf);
        if (info.entries.length !== tool.expect.entries) throw new Error(`expected ${tool.expect.entries} ZIP entries, got ${info.entries.length}`);
      } else {
        const text = buf.toString("utf8");
        info.chars = text.length;
        if (!text.includes(tool.expect.contains)) throw new Error(`text does not contain "${tool.expect.contains}"`);
      }
      res.download = info;
      res.files.push(info.file);
    });
    if (!res.download) res.download = { failed: true };
  }

  phase = "after";
  await page.waitForTimeout(800);
  res.counter = await page.getByTestId("outside-requests").allTextContents().catch(() => []);

  const outside = ctxReqs.filter((r) => r.host === "outside");
  const withBody = ctxReqs.filter((r) => r.bodyBytes > 0);
  const nonGet = ctxReqs.filter((r) => !["GET", "HEAD", "OPTIONS"].includes(r.method));
  res.network = {
    total: ctxReqs.length,
    pageEventTotal: pageReqs.size,
    outside,
    withBody,
    nonGet,
    sockets,
    afterFileChosen: ctxReqs.filter((r) => !["load-page", "open-page", "shot-empty"].includes(r.phase) && r.host !== "local-scheme").map((r) => `${r.method} ${new URL(r.url).pathname}`),
    hosts: [...new Set(ctxReqs.map((r) => (r.host === "local-scheme" ? r.url.split(":")[0] + ":" : new URL(r.url).host)))],
  };
  res.shots.forEach((s) => res.files.push(...s.files));
  await context.close();
  console.log(`  ${res.failures.length ? "✗" : "✓"} ${tool.slug.padEnd(22)} requests ${ctxReqs.length}, outside ${outside.length}, bodies ${withBody.length}, counter ${res.counter.join("/") || "?"}${res.failures.length ? "  FAILED: " + res.failures.map((f) => f.step).join(", ") : ""}`);
  return res;
}

/* ------------------------------------------------------------------ live counts */

async function scrapeCounts() {
  const context = await browser.newContext({ viewport: VIEW, colorScheme: "dark" });
  const page = await context.newPage();
  const result = {};
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  result.home = await page.evaluate(() => {
    const lines = document.body.innerText.split("\n").map((l) => l.trim()).filter((l) => /\b\d+\s+tools?\b/i.test(l));
    const ledger = [...document.querySelectorAll('[aria-label$=" tools"], [aria-label$=" tool"]')].map((e) => {
      const li = e.closest("li");
      return { label: e.getAttribute("aria-label"), row: li ? li.innerText.replace(/\s+/g, " ").trim() : null };
    });
    return { title: document.title, lines, ledger };
  });
  await page.goto(`${base}/category/pdf`, { waitUntil: "networkidle" });
  result.categoryPdf = await page.evaluate(() => {
    const lines = document.body.innerText.split("\n").map((l) => l.trim()).filter((l) => /\b\d+\s+(pdf\s+)?tools?\b/i.test(l));
    const links = [...new Set([...document.querySelectorAll('main a[href^="/tools/"]')].map((a) => a.getAttribute("href")))];
    return { title: document.title, h1: document.querySelector("h1")?.innerText, intro: document.querySelector("h1 + p")?.innerText ?? null, lines, toolLinks: links.length, slugs: links.map((l) => l.replace("/tools/", "")) };
  });
  await page.goto(`${base}/tools`, { waitUntil: "networkidle" });
  result.catalogue = await page.evaluate(() => {
    const lines = document.body.innerText.split("\n").map((l) => l.trim()).filter((l) => /\b\d+\s+tools?\b/i.test(l));
    return { h1: document.querySelector("h1")?.innerText, lines, toolLinks: new Set([...document.querySelectorAll('a[href^="/tools/"]')].map((a) => a.getAttribute("href"))).size };
  });
  await context.close();
  return result;
}

/* ------------------------------------------------------------------ run */

console.log(`Toolwright social shots from ${base} → ${out}`);
const counts = await scrapeCounts();
console.log("  homepage:", counts.home.lines.slice(0, 4).join(" | "));
console.log("  /category/pdf:", counts.categoryPdf.lines.join(" | "), `(${counts.categoryPdf.toolLinks} tool links)`);
const results = [];
for (const tool of tools) results.push(await runTool(tool));
await browser.close();

writeFileSync(join(out, "report.json"), JSON.stringify({ base, ranAt: new Date().toISOString(), counts, results }, null, 2));
const failed = results.filter((r) => r.failures.length);
const outsideTotal = results.reduce((n, r) => n + r.network.outside.length, 0);
const bodyTotal = results.reduce((n, r) => n + r.network.withBody.length, 0);
console.log(`\nDone. ${results.length} tools, ${failed.length} with failures, ${outsideTotal} outside requests, ${bodyTotal} requests with a body.`);
console.log(`Report: ${join(out, "report.json")}`);
if (!existsSync(join(out, "report.json"))) process.exit(1);
