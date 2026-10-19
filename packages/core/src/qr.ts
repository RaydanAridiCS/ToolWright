/** QR code generation (synchronous SVG) and payload builders for common QR content types. */

import QRCode from "qrcode";

export type ErrorCorrection = "L" | "M" | "Q" | "H";

export interface QrSvgOptions {
  /** Error correction level. Higher levels survive more damage but need a larger code. */
  ecc?: ErrorCorrection;
  /** Quiet-zone width, in modules. The spec recommends 4. */
  margin?: number;
  dark?: string;
  light?: string | null;
  /** Rounded module corners. */
  rounded?: boolean;
  /** Rendered pixel size of the SVG (width/height attributes). */
  size?: number;
}

export function qrMatrix(text: string, ecc: ErrorCorrection = "M"): boolean[][] {
  const qr = QRCode.create(text, { errorCorrectionLevel: ecc });
  const { size } = qr.modules;
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.modules.get(row, col) === 1));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function qrToSvg(text: string, options: QrSvgOptions = {}): string {
  const { ecc = "M", margin = 4, dark = "#000000", light = "#ffffff", rounded = false, size = 256 } = options;
  if (!text) throw new RangeError("Enter some content to encode.");
  const matrix = qrMatrix(text, ecc);
  const n = matrix.length;
  const total = n + margin * 2;
  let path = "";
  matrix.forEach((row, y) => {
    if (rounded) {
      row.forEach((on, x) => {
        if (on) path += `M${x + margin + 0.5} ${y + margin}a0.5 0.5 0 1 1 0 1a0.5 0.5 0 1 1 0-1z`;
      });
      return;
    }
    // Merge horizontal runs into single rectangles to keep the SVG small.
    let x = 0;
    while (x < n) {
      if (row[x]) {
        let end = x;
        while (end + 1 < n && row[end + 1]) end++;
        path += `M${x + margin} ${y + margin}h${end - x + 1}v1h-${end - x + 1}z`;
        x = end + 1;
      } else x++;
    }
  });
  const background = light ? `<rect width="${total}" height="${total}" fill="${esc(light)}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="${rounded ? "geometricPrecision" : "crispEdges"}">${background}<path d="${path}" fill="${esc(dark)}"/></svg>`;
}

/* ------------------------------ Payload builders ------------------------------ */

const wifiEscape = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");

export function wifiPayload(options: { ssid: string; password?: string; security?: "WPA" | "WEP" | "nopass"; hidden?: boolean }): string {
  const { ssid, password = "", security = "WPA", hidden = false } = options;
  if (!ssid) throw new RangeError("Network name (SSID) is required.");
  const auth = security === "nopass" ? "nopass" : security;
  return `WIFI:T:${auth};S:${wifiEscape(ssid)};${security === "nopass" ? "" : `P:${wifiEscape(password)};`}${hidden ? "H:true;" : ""};`;
}

const vcardEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

export interface VCardInput {
  firstName?: string;
  lastName?: string;
  organization?: string;
  title?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  note?: string;
}

export function vcardPayload(input: VCardInput): string {
  const { firstName = "", lastName = "" } = input;
  if (!firstName && !lastName && !input.organization) throw new RangeError("Enter at least a name or organization.");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${vcardEscape(lastName)};${vcardEscape(firstName)};;;`,
    `FN:${vcardEscape([firstName, lastName].filter(Boolean).join(" ") || (input.organization ?? ""))}`,
    input.organization && `ORG:${vcardEscape(input.organization)}`,
    input.title && `TITLE:${vcardEscape(input.title)}`,
    input.phone && `TEL;TYPE=CELL:${input.phone}`,
    input.email && `EMAIL:${input.email}`,
    input.website && `URL:${input.website}`,
    input.address && `ADR:;;${vcardEscape(input.address)};;;;`,
    input.note && `NOTE:${vcardEscape(input.note)}`,
    "END:VCARD",
  ];
  return lines.filter(Boolean).join("\n");
}

export function emailPayload(options: { to: string; subject?: string; body?: string }): string {
  const params = new URLSearchParams();
  if (options.subject) params.set("subject", options.subject);
  if (options.body) params.set("body", options.body);
  const query = params.toString().replace(/\+/g, "%20");
  return `mailto:${options.to}${query ? `?${query}` : ""}`;
}

export const smsPayload = (phone: string, message = "") => `SMSTO:${phone}:${message}`;
export const phonePayload = (phone: string) => `tel:${phone}`;
export const geoPayload = (lat: number, lng: number) => `geo:${lat},${lng}`;

export function eventPayload(options: { title: string; start: Date; end?: Date; location?: string; description?: string }): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VEVENT",
    `SUMMARY:${vcardEscape(options.title)}`,
    `DTSTART:${fmt(options.start)}`,
    options.end && `DTEND:${fmt(options.end)}`,
    options.location && `LOCATION:${vcardEscape(options.location)}`,
    options.description && `DESCRIPTION:${vcardEscape(options.description)}`,
    "END:VEVENT",
  ]
    .filter(Boolean)
    .join("\n");
}
