import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";
import { decryptPdf, encryptPdf, PdfPasswordError, permissionsValue, rc4, readPdfSecurity } from "../src/pdf-crypto";
import { readBack } from "./pdf-read-back";

/*
 * The encrypted fixtures were made by other software, not by this module:
 * - rc4-40, rc4-128, aes-128, aes-256-r5, aes-256 (revision 6) and owner-only by pypdf 5.4 from plain.pdf;
 * - rc4-128-objstm by a short Python script (hashlib + the cryptography package's ARC4) from a pdf-lib file with
 *   object streams and a cross-reference stream, with the Encrypt dictionary written straight into the trailer.
 * Every one opens in pypdf with the passwords below.
 */
const DIR = join(import.meta.dirname, "fixtures", "pdf", "encrypted");
const fixture = (name: string) => new Uint8Array(readFileSync(join(DIR, `${name}.pdf`)));

const CASES = [
  { name: "rc4-40", method: "RC4 40-bit", revision: 2, user: "user40", owner: "owner40" },
  { name: "rc4-128", method: "RC4 128-bit", revision: 3, user: "user128", owner: "owner128" },
  { name: "rc4-128-objstm", method: "RC4 128-bit", revision: 3, user: "objstm-user", owner: "objstm-owner" },
  { name: "aes-128", method: "AES-128", revision: 4, user: "useraes", owner: "owneraes" },
  { name: "aes-256-r5", method: "AES-256", revision: 5, user: "userr5", owner: "ownerr5" },
  // pypdf stores "pässwörd" as Latin-1 rather than the UTF-8 the standard asks for; readers accept both.
  { name: "aes-256", method: "AES-256", revision: 6, user: "pässwörd", owner: "owner256" },
];

/** What a reader sees: the title, the page text and the link's address all have to come back in the clear. */
async function expectReadable(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  expect(doc.isEncrypted).toBe(false);
  expect(doc.getPageCount()).toBe(2);
  expect(doc.getTitle()).toBe("Quarterly secret report");
  const link = doc.getPage(0).node.lookup(PDFName.of("Annots"), PDFArray).lookup(0, PDFDict);
  expect(link.lookup(PDFName.of("A"), PDFDict).lookup(PDFName.of("URI"), PDFString, PDFHexString).decodeText()).toBe("https://example.com/hidden-link");
  expect(await readBack(bytes, 2)).toContain("Hello secret world, page 2");
}

async function pdfjsOpens(bytes: Uint8Array, password?: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes.slice(), password, useWorkerFetch: false, useSystemFonts: false, verbosity: 0 });
  try {
    const doc = await task.promise;
    const content = await (await doc.getPage(1)).getTextContent();
    return content.items.map((item) => ("str" in item ? item.str : "")).join("");
  } finally {
    await task.destroy();
  }
}

describe("rc4", () => {
  it("matches the published test vectors", () => {
    const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
    expect(hex(rc4(new TextEncoder().encode("Key"), new TextEncoder().encode("Plaintext")))).toBe("bbf316e8d940af0ad3");
    expect(hex(rc4(new TextEncoder().encode("Secret"), new TextEncoder().encode("Attack at dawn")))).toBe("45a01f645fc35b383552544b9bf5");
  });
});

describe("readPdfSecurity", () => {
  it("is null for a PDF without encryption", async () => {
    expect(await readPdfSecurity(fixture("plain"))).toBeNull();
  });

  it.each(CASES)("names the method of $name and sees that it needs a password", async ({ name, method, revision }) => {
    expect(await readPdfSecurity(fixture(name))).toMatchObject({ method, revision, needsPassword: true });
  });

  it("reads the restrictions of a file that opens without a password", async () => {
    expect(await readPdfSecurity(fixture("owner-only"))).toEqual({
      method: "AES-128",
      revision: 4,
      needsPassword: false,
      permissions: { print: false, copy: false, modify: true, annotate: true },
    });
  });
});

describe("decryptPdf", () => {
  it.each(CASES)("opens $name with the open password and with the owner password", async ({ name, user, owner }) => {
    await expectReadable(await decryptPdf(fixture(name), user));
    await expectReadable(await decryptPdf(fixture(name), owner));
  });

  it.each(CASES)("refuses a wrong or missing password for $name", async ({ name }) => {
    await expect(decryptPdf(fixture(name), "not-it")).rejects.toBeInstanceOf(PdfPasswordError);
    await expect(decryptPdf(fixture(name))).rejects.toThrow(/needs a password/);
  });

  it("removes the restrictions from a file that opens without a password", async () => {
    const out = await decryptPdf(fixture("owner-only"));
    await expectReadable(out);
    expect(await readPdfSecurity(out)).toBeNull();
  });

  it("says when there is nothing to remove", async () => {
    await expect(decryptPdf(fixture("plain"), "x")).rejects.toThrow(/no password/);
  });
});

describe("encryptPdf", () => {
  it("writes AES-256 that PDF.js opens only with the password", async () => {
    const { data } = await encryptPdf(fixture("plain"), { userPassword: "open sesame" });
    expect(await readPdfSecurity(data)).toMatchObject({ method: "AES-256", revision: 6, needsPassword: true });
    expect(await pdfjsOpens(data, "open sesame")).toContain("Hello secret world, page 1");
    await expect(pdfjsOpens(data)).rejects.toThrow(/password/i);
    await expect(pdfjsOpens(data, "wrong")).rejects.toThrow(/password/i);
    await expect(PDFDocument.load(data)).rejects.toThrow(/encrypted/i);
  });

  it("leaves no readable text, title or link in the file", async () => {
    const { data } = await encryptPdf(fixture("plain"), { userPassword: "pw" });
    const raw = Buffer.from(data).toString("latin1");
    for (const secret of ["Quarterly secret report", "Ada Lovelace", "hidden-link", "Hello secret"]) expect(raw).not.toContain(secret);
  });

  it("round-trips through decryptPdf with either password", async () => {
    const { data } = await encryptPdf(fixture("plain"), { userPassword: "ünïcode pw", ownerPassword: "the-owner" });
    await expectReadable(await decryptPdf(data, "ünïcode pw"));
    await expectReadable(await decryptPdf(data, "the-owner"));
  });

  it("can restrict a file that opens without a password, and makes an owner password when none is given", async () => {
    const restricted = { print: false, copy: false, modify: true, annotate: true };
    const { data, ownerPassword } = await encryptPdf(fixture("plain"), { userPassword: "", permissions: restricted });
    expect(ownerPassword).toMatch(/^[A-Za-z2-9]{20}$/);
    expect(await readPdfSecurity(data)).toEqual({ method: "AES-256", revision: 6, needsPassword: false, permissions: restricted });
    expect(await pdfjsOpens(data)).toContain("Hello secret world");
    await expectReadable(await decryptPdf(data, ownerPassword));
  });

  it("refuses settings that would protect nothing, or let the open password lift the restrictions", async () => {
    await expect(encryptPdf(fixture("plain"), { userPassword: "" })).rejects.toThrow(/Set a password/);
    await expect(encryptPdf(fixture("plain"), { userPassword: "same", ownerPassword: "same", permissions: { print: false, copy: true, modify: true, annotate: true } })).rejects.toThrow(/different owner password/);
  });

  it("asks for the old password to be removed first", async () => {
    await expect(encryptPdf(fixture("aes-128"), { userPassword: "x" })).rejects.toThrow(/already has a password/);
  });
});

describe("permissionsValue", () => {
  it("sets the reserved bits and only the allowed permission bits", () => {
    expect(permissionsValue({ print: true, copy: true, modify: true, annotate: true })).toBe(-4);
    expect((permissionsValue({ print: false, copy: false, modify: false, annotate: false }) >>> 0).toString(16)).toBe("fffff2c0");
  });
});
