/**
 * PDF password protection, in the browser: the PDF "Standard security handler" (ISO 32000-2, 7.6.4).
 *
 * - `readPdfSecurity` says whether a PDF is encrypted, how, whether it needs a password to open, and what the
 *   owner password restricts.
 * - `decryptPdf` removes the encryption (with the open password, the owner password, or none when the file only
 *   has an owner password), revisions 2 to 6: RC4 40-bit and 128-bit, AES-128 and AES-256.
 * - `encryptPdf` writes AES-256 (revision 6, the current standard) with an open password, an owner password
 *   and permission flags.
 *
 * pdf-lib has no encryption support, so this works one level down: its parser reads the objects (keeping
 * object streams sealed until they are decrypted), the strings and streams are deciphered or enciphered here,
 * and its writer saves the result. MD5 and RC4 are plain JavaScript; AES and SHA-2 use Web Crypto.
 */
import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFHeader,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObjectStreamParser,
  PDFParser,
  PDFRawStream,
  PDFRef,
  PDFString,
  PDFWriter,
  PDFXRefStreamParser,
  type PDFContext,
  type PDFObject,
} from "pdf-lib";
import { md5Bytes, toHex } from "./hash";
import { PdfError } from "./pdf";

/** Thrown when the password does not open the file. The UI asks again. */
export class PdfPasswordError extends PdfError {
  constructor(message = "That password does not open this PDF.") {
    super(message);
    this.name = "PdfPasswordError";
  }
}

export interface PdfPermissions {
  print: boolean;
  /** Copy text and images. */
  copy: boolean;
  /** Change the pages: edit, insert, delete, rotate. */
  modify: boolean;
  /** Add comments and fill in form fields. */
  annotate: boolean;
}

export const ALL_PERMISSIONS: PdfPermissions = { print: true, copy: true, modify: true, annotate: true };

export interface PdfSecurity {
  /** "AES-256", "AES-128", "RC4 128-bit" or "RC4 40-bit". */
  method: string;
  revision: number;
  /** False when the file opens without a password (it only has an owner password). */
  needsPassword: boolean;
  permissions: PdfPermissions;
}

export interface EncryptOptions {
  /** Needed to open the file. Empty means anyone can open it, and only the permissions apply. */
  userPassword: string;
  /** Needed to change the permissions. Leave empty to have a random one made (returned by `encryptPdf`). */
  ownerPassword?: string;
  permissions?: PdfPermissions;
}

// ---------------------------------------------------------------------------------------------- primitives

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new PdfError("This browser cannot encrypt or decrypt (Web Crypto is missing).");
  return s;
};

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

const equalBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** Web Crypto wants an ArrayBuffer-backed view. */
const buf = (bytes: Uint8Array) => bytes as Uint8Array<ArrayBuffer>;

async function sha2(bits: 256 | 384 | 512, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().digest(`SHA-${bits}`, buf(data)));
}

export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i]! + key[i % key.length]!) & 255;
    [s[i], s[j]] = [s[j]!, s[i]!];
  }
  const out = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]!) & 255;
    [s[i], s[j]] = [s[j]!, s[i]!];
    out[k] = data[k]! ^ s[(s[i]! + s[j]!) & 255]!;
  }
  return out;
}

const aesKey = (raw: Uint8Array) => subtle().importKey("raw", buf(raw), { name: "AES-CBC" }, false, ["encrypt", "decrypt"]);

/** AES-CBC encryption without padding (`data` must be whole blocks). Web Crypto always pads, so the extra block is cut off. */
async function aesEncryptRaw(key: CryptoKey, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().encrypt({ name: "AES-CBC", iv: buf(iv) }, key, buf(data))).subarray(0, data.length);
}

/**
 * AES-CBC decryption without checking padding (`data` must be whole blocks). Web Crypto insists on valid PKCS#7
 * padding, so a block that decrypts to a full padding block is appended: encrypting nothing with the last
 * ciphertext block as the IV gives exactly that block.
 */
async function aesDecryptRaw(key: CryptoKey, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  if (data.length === 0) return data;
  const last = data.subarray(data.length - 16);
  const filler = new Uint8Array(await subtle().encrypt({ name: "AES-CBC", iv: buf(last) }, key, new Uint8Array(0)));
  return new Uint8Array(await subtle().decrypt({ name: "AES-CBC", iv: buf(iv) }, key, buf(concat(data, filler))));
}

/** A PDF AES string or stream: 16 bytes of IV, then the ciphertext with PKCS#5 padding. Lenient about damaged padding, like readers are. */
async function aesDecryptPdf(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  if (data.length < 32) return new Uint8Array(0);
  const body = data.subarray(16, 16 + Math.floor((data.length - 16) / 16) * 16);
  const plain = await aesDecryptRaw(key, data.subarray(0, 16), body);
  const pad = plain[plain.length - 1] ?? 0;
  if (pad >= 1 && pad <= 16 && plain.length >= pad && plain.subarray(plain.length - pad).every((b) => b === pad)) return plain.subarray(0, plain.length - pad);
  return plain;
}

async function aesEncryptPdf(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = randomBytes(16);
  return concat(iv, new Uint8Array(await subtle().encrypt({ name: "AES-CBC", iv: buf(iv) }, key, buf(data))));
}

// ----------------------------------------------------------------------------------------- password hashes

/** The 32-byte padding string of the older revisions (Algorithm 2, step a). */
const PAD = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

/** Revisions 2-4 take the password in PDFDocEncoding, which matches Latin-1 for what people type. */
function legacyPassword(password: string): Uint8Array {
  const bytes = Uint8Array.from(Array.from(password).slice(0, 32), (c) => {
    const code = c.codePointAt(0) ?? 63;
    return code < 256 ? code : 63;
  });
  return concat(bytes, PAD).subarray(0, 32);
}

/** Revisions 5 and 6 take the password as UTF-8 (after normalising, which stands in for SASLprep), at most 127 bytes. */
function modernPassword(password: string): Uint8Array {
  return new TextEncoder().encode(password.normalize("NFKC")).subarray(0, 127);
}

/** Algorithm 2.B (revision 6): SHA-256, then rounds of AES-128 and SHA-256/384/512 until the stop rule holds. */
async function hash2B(password: Uint8Array, salt: Uint8Array, userKey: Uint8Array): Promise<Uint8Array> {
  let k = await sha2(256, concat(password, salt, userKey));
  for (let round = 0; ; round++) {
    const unit = concat(password, k, userKey);
    const k1 = new Uint8Array(unit.length * 64);
    for (let i = 0; i < 64; i++) k1.set(unit, i * unit.length);
    const e = await aesEncryptRaw(await aesKey(k.subarray(0, 16)), k.subarray(16, 32), k1);
    let sum = 0;
    for (let i = 0; i < 16; i++) sum += e[i]!;
    const which = sum % 3;
    k = await sha2(which === 0 ? 256 : which === 1 ? 384 : 512, e);
    if (round >= 63 && e[e.length - 1]! <= round - 31) break;
  }
  return k.subarray(0, 32);
}

const modernHash = (revision: number, password: Uint8Array, salt: Uint8Array, userKey: Uint8Array) =>
  revision >= 6 ? hash2B(password, salt, userKey) : sha2(256, concat(password, salt, userKey));

// --------------------------------------------------------------------------------------- the Encrypt dict

type Cipher = "rc4" | "aes" | "none";

interface Handler {
  revision: number;
  version: number;
  keyLength: number;
  o: Uint8Array;
  u: Uint8Array;
  oe: Uint8Array;
  ue: Uint8Array;
  p: number;
  encryptMetadata: boolean;
  id0: Uint8Array;
  stream: Cipher;
  string: Cipher;
}

const bytesOf = (o: PDFObject | undefined): Uint8Array => (o instanceof PDFString || o instanceof PDFHexString ? o.asBytes() : new Uint8Array(0));

const numberOf = (o: PDFObject | undefined, fallback: number) => (o instanceof PDFNumber ? o.asNumber() : fallback);

function cipherOf(encrypt: PDFDict, filterName: string, version: number): Cipher {
  if (version < 4) return "rc4";
  const name = encrypt.lookup(PDFName.of(filterName));
  // A missing StmF/StrF means Identity: that kind of data is not encrypted.
  if (!(name instanceof PDFName) || name.asString() === "/Identity") return "none";
  const filters = encrypt.lookup(PDFName.of("CF"));
  const filter = filters instanceof PDFDict ? filters.lookup(PDFName.of(name.asString().slice(1))) : undefined;
  const method = filter instanceof PDFDict ? filter.lookup(PDFName.of("CFM")) : undefined;
  const cfm = method instanceof PDFName ? method.asString() : "/None";
  if (cfm === "/V2") return "rc4";
  if (cfm === "/AESV2" || cfm === "/AESV3") return "aes";
  return "none";
}

function readHandler(context: PDFContext): Handler | null {
  const encrypt = context.lookup(context.trailerInfo.Encrypt);
  if (!(encrypt instanceof PDFDict)) return null;
  const filter = encrypt.lookup(PDFName.of("Filter"));
  if (!(filter instanceof PDFName) || filter.asString() !== "/Standard") throw new PdfError("This PDF is protected with a certificate or a custom security plug-in, which a browser cannot open.");
  const version = numberOf(encrypt.lookup(PDFName.of("V")), 0);
  const revision = numberOf(encrypt.lookup(PDFName.of("R")), 2);
  if (revision < 2 || revision > 6 || version < 1 || version > 5 || version === 3) throw new PdfError(`This PDF uses an encryption version (V${version}, R${revision}) that is not supported.`);
  const meta = encrypt.lookup(PDFName.of("EncryptMetadata"));
  const ids = context.lookup(context.trailerInfo.ID);
  return {
    revision,
    version,
    keyLength: version === 1 ? 5 : version >= 5 ? 32 : Math.floor(numberOf(encrypt.lookup(PDFName.of("Length")), 40) / 8),
    o: bytesOf(encrypt.lookup(PDFName.of("O"))),
    u: bytesOf(encrypt.lookup(PDFName.of("U"))),
    oe: bytesOf(encrypt.lookup(PDFName.of("OE"))),
    ue: bytesOf(encrypt.lookup(PDFName.of("UE"))),
    p: numberOf(encrypt.lookup(PDFName.of("P")), -4) | 0,
    encryptMetadata: !(meta instanceof PDFBool) || meta.asBoolean(),
    id0: ids instanceof PDFArray ? bytesOf(ids.lookup(0)) : new Uint8Array(0),
    stream: cipherOf(encrypt, "StmF", version),
    string: cipherOf(encrypt, "StrF", version),
  };
}

const le32 = (n: number) => Uint8Array.of(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);

/** Algorithm 2: the file key of revisions 2-4 from a (padded) user password. */
function legacyFileKey(h: Handler, padded: Uint8Array): Uint8Array {
  const extra = h.revision >= 4 && !h.encryptMetadata ? Uint8Array.of(255, 255, 255, 255) : new Uint8Array(0);
  let key = md5Bytes(concat(padded, h.o.subarray(0, 32), le32(h.p), h.id0, extra));
  const n = h.revision === 2 ? 5 : h.keyLength;
  if (h.revision >= 3) for (let i = 0; i < 50; i++) key = md5Bytes(key.subarray(0, n));
  return key.slice(0, n);
}

/** Algorithms 4 and 5: the U value a key produces. Revision 3+ compares only the first 16 bytes. */
function legacyUserCheck(h: Handler, key: Uint8Array): boolean {
  if (h.revision === 2) return equalBytes(rc4(key, PAD), h.u.subarray(0, 32));
  let x = rc4(key, md5Bytes(concat(PAD, h.id0)));
  for (let i = 1; i <= 19; i++) x = rc4(key.map((b) => b ^ i), x);
  return equalBytes(x, h.u.subarray(0, 16));
}

/** Algorithm 7: the owner password unlocks the user password stored in O. */
function legacyUserFromOwner(h: Handler, owner: Uint8Array): Uint8Array {
  let digest = md5Bytes(owner);
  if (h.revision >= 3) for (let i = 0; i < 50; i++) digest = md5Bytes(digest);
  const key = digest.subarray(0, h.revision === 2 ? 5 : h.keyLength);
  if (h.revision === 2) return rc4(key, h.o.subarray(0, 32));
  let x = h.o.subarray(0, 32);
  for (let i = 19; i >= 0; i--) x = rc4(key.map((b) => b ^ i), x);
  return x;
}

/** The file key for a password, tried as the user password and then as the owner password. Null when neither fits. */
async function fileKeyFor(h: Handler, password: string): Promise<Uint8Array | null> {
  if (h.revision <= 4) {
    const user = legacyPassword(password);
    const asUser = legacyFileKey(h, user);
    if (legacyUserCheck(h, asUser)) return asUser;
    const asOwner = legacyFileKey(h, legacyUserFromOwner(h, user));
    return legacyUserCheck(h, asOwner) ? asOwner : null;
  }
  // The standard says UTF-8. Some writers (pypdf among them) use Latin-1 when every character fits, so try that too.
  const latin1 = Array.from(password).every((c) => (c.codePointAt(0) ?? 256) < 256) ? Uint8Array.from(Array.from(password), (c) => c.codePointAt(0)!).subarray(0, 127) : null;
  for (const pw of [modernPassword(password), ...(latin1 && !equalBytes(latin1, modernPassword(password)) ? [latin1] : [])]) {
    const key = await modernFileKey(h, pw);
    if (key) return key;
  }
  return null;
}

async function modernFileKey(h: Handler, pw: Uint8Array): Promise<Uint8Array | null> {
  const zeroIv = new Uint8Array(16);
  const u48 = h.u.subarray(0, 48);
  if (equalBytes(await modernHash(h.revision, pw, h.u.subarray(32, 40), new Uint8Array(0)), h.u.subarray(0, 32))) {
    const k = await modernHash(h.revision, pw, h.u.subarray(40, 48), new Uint8Array(0));
    return aesDecryptRaw(await aesKey(k), zeroIv, h.ue.subarray(0, 32));
  }
  if (equalBytes(await modernHash(h.revision, pw, h.o.subarray(32, 40), u48), h.o.subarray(0, 32))) {
    const k = await modernHash(h.revision, pw, h.o.subarray(40, 48), u48);
    return aesDecryptRaw(await aesKey(k), zeroIv, h.oe.subarray(0, 32));
  }
  return null;
}

/** Revisions 2-4 use a different key for each object (Algorithm 1). */
function objectKey(h: Handler, fileKey: Uint8Array, ref: PDFRef, aes: boolean): Uint8Array {
  const n = ref.objectNumber;
  const g = ref.generationNumber;
  const salt = aes ? Uint8Array.of(0x73, 0x41, 0x6c, 0x54) : new Uint8Array(0);
  const digest = md5Bytes(concat(fileKey, Uint8Array.of(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, g & 255, (g >>> 8) & 255), salt));
  return digest.subarray(0, Math.min(fileKey.length + 5, 16));
}

const PERMISSION_BITS = { print: (1 << 2) | (1 << 11), modify: (1 << 3) | (1 << 10), copy: 1 << 4, annotate: (1 << 5) | (1 << 8) } as const;

function permissionsOf(p: number): PdfPermissions {
  return { print: (p & (1 << 2)) !== 0, copy: (p & (1 << 4)) !== 0, modify: (p & (1 << 3)) !== 0, annotate: (p & (1 << 5)) !== 0 };
}

/** The P value: reserved bits set, accessibility extraction always allowed. */
export function permissionsValue(permissions: PdfPermissions): number {
  let p = 0xfffff0c0 | (1 << 9);
  for (const key of Object.keys(PERMISSION_BITS) as (keyof PdfPermissions)[]) if (permissions[key]) p |= PERMISSION_BITS[key];
  return p | 0;
}

function methodName(h: Handler): string {
  if (h.stream === "aes" || h.string === "aes") return h.keyLength >= 32 ? "AES-256" : "AES-128";
  return h.keyLength <= 5 ? "RC4 40-bit" : `RC4 ${h.keyLength * 8}-bit`;
}

// ------------------------------------------------------------------------------------------------ parsing

const ENDOBJ = Array.from("endobj", (c) => c.charCodeAt(0));

interface SealedParse {
  context: PDFContext;
  /** Object streams, not yet opened, with their position in the file. */
  objectStreams: { ref: PDFRef; stream: PDFRawStream; order: number }[];
  /** Position in the file of each top-level object, so later revisions win, as when pdf-lib reads normally. */
  order: Map<string, number>;
}

interface ParserInternals {
  context: PDFContext;
  parseIndirectObject: () => Promise<PDFRef>;
  parseIndirectObjectHeader: () => PDFRef;
  skipWhitespaceAndComments: () => void;
  parseObject: () => PDFObject;
  matchKeyword: (keyword: number[]) => boolean;
}

const isType = (stream: PDFObject, type: string) => stream instanceof PDFRawStream && stream.dict.lookup(PDFName.of("Type")) === PDFName.of(type);

/** Reads every object, but leaves object streams closed: in an encrypted file they must be decrypted before they can be read. */
async function parseSealed(bytes: Uint8Array): Promise<SealedParse> {
  const parser = PDFParser.forBytesWithOptions(bytes, 500, false, false);
  const inner = parser as unknown as ParserInternals;
  const objectStreams: SealedParse["objectStreams"] = [];
  const order = new Map<string, number>();
  let position = 0;
  inner.parseIndirectObject = async function parseIndirectObject(this: ParserInternals) {
    const ref = this.parseIndirectObjectHeader();
    this.skipWhitespaceAndComments();
    const object = this.parseObject();
    this.skipWhitespaceAndComments();
    this.matchKeyword(ENDOBJ);
    if (isType(object, "ObjStm")) objectStreams.push({ ref, stream: object as PDFRawStream, order: position++ });
    // The cross-reference stream is never encrypted; pdf-lib reads the trailer from it as usual.
    else if (isType(object, "XRef")) PDFXRefStreamParser.forStream(object as PDFRawStream).parseIntoContext();
    else {
      this.context.assign(ref, object);
      order.set(ref.toString(), position++);
    }
    return ref;
  };
  try {
    const context = await parser.parseDocument();
    return { context, objectStreams, order };
  } catch {
    throw new PdfError("This PDF could not be read. It may be damaged.");
  }
}

/** Opens the (now readable) object streams in file order; an object written later in the file as a plain object still wins. */
async function openObjectStreams(parse: SealedParse) {
  for (const { stream, order } of [...parse.objectStreams].sort((a, b) => a.order - b.order)) {
    const keep = parse.context.enumerateIndirectObjects().filter(([ref]) => (parse.order.get(ref.toString()) ?? -1) > order);
    await PDFObjectStreamParser.forStream(stream, () => false).parseIntoContext();
    for (const [ref, object] of keep) parse.context.assign(ref, object);
  }
}

// ----------------------------------------------------------------------------------------- object walking

type Transform = (data: Uint8Array) => Promise<Uint8Array>;

/** Rewrites every string inside a value (but not inside a signature's /Contents, which is never encrypted). */
async function mapStrings(value: PDFObject, fn: Transform): Promise<PDFObject> {
  if (value instanceof PDFString || value instanceof PDFHexString) return PDFHexString.of(toHex(await fn(value.asBytes())));
  if (value instanceof PDFArray) {
    for (let i = 0; i < value.size(); i++) value.set(i, await mapStrings(value.get(i), fn));
    return value;
  }
  if (value instanceof PDFDict) {
    const signature = value.lookup(PDFName.of("Type")) === PDFName.of("Sig") || value.has(PDFName.of("ByteRange"));
    for (const [key, entry] of value.entries()) {
      if (signature && key === PDFName.of("Contents")) continue;
      value.set(key, await mapStrings(entry, fn));
    }
    return value;
  }
  return value;
}

/** A stream that the Encrypt settings leave in the clear: unencrypted metadata, or an Identity crypt filter. */
function streamExempt(stream: PDFRawStream, h: Handler): boolean {
  if (!h.encryptMetadata && stream.dict.lookup(PDFName.of("Type")) === PDFName.of("Metadata")) return true;
  const filter = stream.dict.lookup(PDFName.of("Filter"));
  const names = filter instanceof PDFArray ? filter.asArray() : [filter];
  return names.some((n) => n === PDFName.of("Crypt"));
}

async function transformObjects(context: PDFContext, skip: PDFRef | null, h: Handler, cipherFor: (ref: PDFRef, kind: Cipher) => Promise<Transform | null>) {
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (skip && ref === skip) continue;
    const forString = await cipherFor(ref, h.string);
    if (object instanceof PDFRawStream) {
      if (forString) await mapStrings(object.dict, forString);
      const forStream = streamExempt(object, h) ? null : await cipherFor(ref, h.stream);
      if (forStream) context.assign(ref, PDFRawStream.of(object.dict, await forStream(object.contents)));
    } else if (forString) {
      context.assign(ref, await mapStrings(object, forString));
    }
  }
}

async function cipherFactory(h: Handler, fileKey: Uint8Array, direction: "encrypt" | "decrypt") {
  const modernKey = h.revision >= 5 ? await aesKey(fileKey) : null;
  return async (ref: PDFRef, kind: Cipher): Promise<Transform | null> => {
    if (kind === "none") return null;
    if (kind === "rc4") {
      const key = objectKey(h, fileKey, ref, false);
      return async (data) => rc4(key, data);
    }
    const key = modernKey ?? (await aesKey(objectKey(h, fileKey, ref, true)));
    return direction === "decrypt" ? (data) => aesDecryptPdf(key, data) : (data) => aesEncryptPdf(key, data);
  };
}

const serialize = (context: PDFContext) => PDFWriter.forContext(context, 500).serializeToBuffer();

/** Writes the result through pdf-lib once more so it gets compact object streams like every other tool's output. */
async function compact(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.save({ useObjectStreams: true });
}

// -------------------------------------------------------------------------------------------- public API

/** Null when the PDF is not encrypted. */
export async function readPdfSecurity(bytes: Uint8Array): Promise<PdfSecurity | null> {
  const parse = await parseSealed(bytes);
  const h = readHandler(parse.context);
  if (!h) return null;
  return { method: methodName(h), revision: h.revision, needsPassword: (await fileKeyFor(h, "")) === null, permissions: permissionsOf(h.p) };
}

/**
 * Removes the encryption. `password` may be the open password or the owner password; leave it empty for a file
 * that opens without one (that removes its restrictions). Throws `PdfPasswordError` when it does not fit.
 */
export async function decryptPdf(bytes: Uint8Array, password = ""): Promise<Uint8Array> {
  const parse = await parseSealed(bytes);
  const { context } = parse;
  const h = readHandler(context);
  if (!h) throw new PdfError("This PDF has no password or restrictions to remove.");
  const fileKey = await fileKeyFor(h, password);
  if (!fileKey) throw new PdfPasswordError(password === "" ? "This PDF needs a password to open." : undefined);

  const encryptRef = context.trailerInfo.Encrypt instanceof PDFRef ? context.trailerInfo.Encrypt : null;
  const cipher = await cipherFactory(h, fileKey, "decrypt");
  await transformObjects(context, encryptRef, h, cipher);
  // Object streams are encrypted as a whole; the objects inside them are not encrypted again.
  for (const entry of parse.objectStreams) {
    const fn = await cipher(entry.ref, h.stream);
    if (fn) entry.stream = PDFRawStream.of(entry.stream.dict, await fn(entry.stream.contents));
  }
  await openObjectStreams(parse);

  if (encryptRef) context.delete(encryptRef);
  context.trailerInfo.Encrypt = undefined;
  try {
    return await compact(await serialize(context));
  } catch {
    throw new PdfError("The password was right, but the decrypted PDF could not be rebuilt. It may be damaged.");
  }
}

/** Builds the revision 6 (AES-256) Encrypt values for a new file key. */
async function revision6(fileKey: Uint8Array, userPassword: string, ownerPassword: string, p: number) {
  const user = modernPassword(userPassword);
  const owner = modernPassword(ownerPassword);
  const zeroIv = new Uint8Array(16);
  const uSalts = randomBytes(16);
  const u = concat(await hash2B(user, uSalts.subarray(0, 8), new Uint8Array(0)), uSalts);
  const ue = await aesEncryptRaw(await aesKey(await hash2B(user, uSalts.subarray(8, 16), new Uint8Array(0))), zeroIv, fileKey);
  const oSalts = randomBytes(16);
  const o = concat(await hash2B(owner, oSalts.subarray(0, 8), u), oSalts);
  const oe = await aesEncryptRaw(await aesKey(await hash2B(owner, oSalts.subarray(8, 16), u)), zeroIv, fileKey);
  // Perms: P, four 0xFF bytes, "T" (metadata is encrypted), "adb", four random bytes; one AES block (ECB = CBC with a zero IV).
  const permsPlain = concat(le32(p), Uint8Array.of(255, 255, 255, 255, 0x54, 0x61, 0x64, 0x62), randomBytes(4));
  const perms = await aesEncryptRaw(await aesKey(fileKey), zeroIv, permsPlain);
  return { u, ue, o, oe, perms };
}

/** A readable random password, used as the owner password when none is given. */
export function randomOwnerPassword(length = 20): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(length), (b) => alphabet[b % alphabet.length]).join("");
}

export interface EncryptResult {
  data: Uint8Array;
  /** The owner password in the file: the one given, or the random one made when none was. */
  ownerPassword: string;
}

/** Protects a PDF with AES-256. The input must not be encrypted already (remove the old password first). */
export async function encryptPdf(bytes: Uint8Array, options: EncryptOptions): Promise<EncryptResult> {
  const permissions = options.permissions ?? ALL_PERMISSIONS;
  const restricted = Object.values(permissions).some((allowed) => !allowed);
  if (!options.userPassword && !restricted) throw new PdfError("Set a password to open the file, or turn off at least one permission.");
  const ownerPassword = options.ownerPassword || randomOwnerPassword();
  if (options.ownerPassword && options.ownerPassword === options.userPassword && restricted) {
    throw new PdfError("Use a different owner password. With the same one, anyone who can open the file could also lift the restrictions.");
  }

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    if (/encrypted/i.test(err instanceof Error ? err.message : "")) throw new PdfError("This PDF already has a password. Remove it with Unlock PDF first.");
    throw new PdfError("This PDF could not be read. It may be damaged.");
  }
  // Every object as a plain, top-level object: object streams would need a second layer of encryption bookkeeping.
  const plain = await doc.save({ useObjectStreams: false });
  const fresh = await PDFDocument.load(plain, { updateMetadata: false });
  const { context } = fresh;

  context.header = PDFHeader.forVersion(1, 7);
  const catalog = context.lookup(context.trailerInfo.Root);
  if (catalog instanceof PDFDict) catalog.set(PDFName.of("Extensions"), context.obj({ ADBE: { BaseVersion: PDFName.of("1.7"), ExtensionLevel: 8 } }));
  if (!(context.lookup(context.trailerInfo.ID) instanceof PDFArray)) {
    const id = PDFHexString.of(toHex(randomBytes(16)));
    context.trailerInfo.ID = context.obj([id, id]);
  }

  const fileKey = randomBytes(32);
  const p = permissionsValue(permissions);
  const v = await revision6(fileKey, options.userPassword, ownerPassword, p);
  const h: Handler = { revision: 6, version: 5, keyLength: 32, o: v.o, u: v.u, oe: v.oe, ue: v.ue, p, encryptMetadata: true, id0: new Uint8Array(0), stream: "aes", string: "aes" };
  await transformObjects(context, null, h, await cipherFactory(h, fileKey, "encrypt"));

  const hex = (b: Uint8Array) => PDFHexString.of(toHex(b));
  const encrypt = context.obj({
    Filter: PDFName.of("Standard"),
    V: 5,
    R: 6,
    Length: 256,
    CF: { StdCF: { AuthEvent: PDFName.of("DocOpen"), CFM: PDFName.of("AESV3"), Length: 32 } },
    StmF: PDFName.of("StdCF"),
    StrF: PDFName.of("StdCF"),
    O: hex(v.o),
    U: hex(v.u),
    OE: hex(v.oe),
    UE: hex(v.ue),
    P: p,
    Perms: hex(v.perms),
    EncryptMetadata: true,
  });
  context.trailerInfo.Encrypt = context.register(encrypt);
  return { data: await serialize(context), ownerPassword };
}
