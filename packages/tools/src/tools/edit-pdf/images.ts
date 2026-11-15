/**
 * Turns a picture the user adds (a file, a paste or a drop) into PNG or JPEG bytes a PDF can hold, the right way up.
 * PNG and JPEG are kept as they are (full quality); a JPEG from a phone that is only turned by its EXIF tag is
 * redrawn upright, because a PDF ignores that tag; any other format the browser can read is redrawn as a PNG.
 */
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

export interface PreparedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** The EXIF orientation of a JPEG (1 = upright), or 1 when it has none. */
export function jpegOrientation(b: Uint8Array): number {
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) return 1;
    const marker = b[i + 1] as number;
    const length = ((b[i + 2] as number) << 8) | (b[i + 3] as number);
    if (marker === 0xda || marker === 0xd9) return 1;
    if (marker === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
      const tiff = i + 10;
      const little = b[tiff] === 0x49;
      const u16 = (at: number) => (little ? (b[at] as number) | ((b[at + 1] as number) << 8) : ((b[at] as number) << 8) | (b[at + 1] as number));
      const u32 = (at: number) => (little ? u16(at) | (u16(at + 2) << 16) : (u16(at) << 16) | u16(at + 2)) >>> 0;
      const ifd = tiff + u32(tiff + 4);
      const count = u16(ifd);
      for (let k = 0; k < count; k++) {
        const entry = ifd + 2 + k * 12;
        if (entry + 10 > b.length) break;
        if (u16(entry) === 0x0112) return u16(entry + 8) || 1;
      }
      return 1;
    }
    i += 2 + length;
  }
  return 1;
}

async function redraw(blob: Blob, type: "image/png" | "image/jpeg"): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot read the picture.");
  if (type === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const out = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture could not be converted."))), type, 0.92));
  const result = { bytes: new Uint8Array(await out.arrayBuffer()), width: canvas.width, height: canvas.height };
  canvas.width = canvas.height = 0;
  return result;
}

export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`The picture is ${Math.round(file.size / 1024 / 1024)} MB. Use one under ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    if (isJpeg(bytes) && jpegOrientation(bytes) > 1) return await redraw(file, "image/jpeg");
    if (isPng(bytes) || isJpeg(bytes)) {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return { bytes, ...size };
    }
    return await redraw(file, "image/png");
  } catch {
    throw new Error("That picture could not be read. Use a PNG, JPEG, WebP or GIF file.");
  }
}
