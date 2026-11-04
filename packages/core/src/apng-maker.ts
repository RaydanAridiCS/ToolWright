/** APNG maker. Combines static PNG frames into an animated PNG in memory; nothing is uploaded. */

import pkg from "@pdf-lib/upng";

const UPNG = ((pkg as unknown as { default: typeof pkg }).default ?? pkg) as {
  decode(buffer: ArrayBuffer): Image;
  encode(imgs: ArrayBuffer[], w: number, h: number, cnum: number, dels?: number[]): ArrayBuffer;
  toRGBA8(out: Image): ArrayBuffer[];
};

interface Image {
  width: number;
  height: number;
  frames: { delay: number }[];
  data: ArrayBuffer;
}

export class ApngMakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApngMakerError";
  }
}

export interface ApngMakerOptions {
  /** Delay between frames in milliseconds. */
  delay: number;
  /** Number of times to loop. 0 means loop forever. */
  loops: number;
}

function findChunk(bytes: Uint8Array, type: string): number {
  let pos = 8; // skip PNG signature
  while (pos < bytes.length) {
    const length = (bytes[pos]! << 24) | (bytes[pos + 1]! << 16) | (bytes[pos + 2]! << 8) | (bytes[pos + 3]!);
    if (String.fromCharCode(bytes[pos + 4]!, bytes[pos + 5]!, bytes[pos + 6]!, bytes[pos + 7]!) === type) {
      return pos;
    }
    pos += 12 + length;
  }
  return -1;
}

function patchAcTL(bytes: Uint8Array, loops: number): Uint8Array {
  const acTLPos = findChunk(bytes, "acTL");
  if (acTLPos === -1) return bytes;
  const copy = new Uint8Array(bytes);
  const dataPos = acTLPos + 8;
  copy[dataPos + 4] = (loops >>> 24) & 0xff;
  copy[dataPos + 5] = (loops >>> 16) & 0xff;
  copy[dataPos + 6] = (loops >>> 8) & 0xff;
  copy[dataPos + 7] = loops & 0xff;
  // Recompute CRC for the chunk.
  const length = 8;
  const crcPos = dataPos + length;
  const crcInput = copy.subarray(dataPos - 4, dataPos + length);
  let crc = 0xffffffff;
  for (let i = 0; i < crcInput.length; i++) {
    crc ^= crcInput[i]!;
    for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ (0xedb88320 * (crc & 1));
  }
  crc ^= 0xffffffff;
  copy[crcPos] = (crc >>> 24) & 0xff;
  copy[crcPos + 1] = (crc >>> 16) & 0xff;
  copy[crcPos + 2] = (crc >>> 8) & 0xff;
  copy[crcPos + 3] = crc & 0xff;
  return copy;
}

/**
 * Combine static PNG frames into an animated PNG.
 *
 * @param frames Array of PNG image bytes, one per frame. All frames must have the same dimensions.
 * @param options Animation timing and loop settings.
 */
export function makeApng(frames: Uint8Array[], options: ApngMakerOptions): Uint8Array {
  if (frames.length < 2) throw new ApngMakerError("Add at least two PNG frames to make an animation.");
  if (!Number.isFinite(options.delay) || options.delay < 20) throw new ApngMakerError("Frame delay must be at least 20 ms.");
  if (!Number.isInteger(options.loops) || options.loops < 0 || options.loops > 0xffffffff) {
    throw new ApngMakerError("Loop count must be 0 (forever) or a positive whole number.");
  }

  let width = 0;
  let height = 0;
  const rgbaFrames: ArrayBuffer[] = [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i] as Uint8Array;
    let img: Image;
    try {
      img = UPNG.decode((frame.buffer as ArrayBuffer).slice(frame.byteOffset, frame.byteOffset + frame.byteLength));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ApngMakerError(`Frame ${i + 1} could not be read as a PNG. ${message}`);
    }
    if (img.frames.length > 0) throw new ApngMakerError(`Frame ${i + 1} is already an animated PNG. Use a static PNG frame.`);
    if (width === 0) {
      width = img.width;
      height = img.height;
    } else if (img.width !== width || img.height !== height) {
      throw new ApngMakerError(`Frame ${i + 1} is ${img.width} × ${img.height}, but all frames must be ${width} × ${height}.`);
    }
    const rgba = UPNG.toRGBA8(img);
    if (rgba.length === 0) throw new ApngMakerError(`Frame ${i + 1} has no readable pixels.`);
    rgbaFrames.push(rgba[0] as unknown as ArrayBuffer);
  }

  const delays = Array.from({ length: frames.length }, () => Math.round(options.delay));
  const apng = new Uint8Array(UPNG.encode(rgbaFrames, width, height, 0, delays));
  return options.loops === 0 ? apng : patchAcTL(apng, options.loops);
}
