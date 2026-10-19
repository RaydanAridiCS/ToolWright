/** Reference data: HTTP status codes, MIME types, well-known ports, and chmod helpers. */

export interface HttpStatus {
  code: number;
  name: string;
  description: string;
}

const s = (code: number, name: string, description: string): HttpStatus => ({ code, name, description });

export const HTTP_STATUS: HttpStatus[] = [
  s(100, "Continue", "The server received the request headers and the client should send the body."),
  s(101, "Switching Protocols", "The server is switching to the protocol requested by the client (for example WebSocket)."),
  s(102, "Processing", "The server has accepted the request but has not finished processing it (WebDAV)."),
  s(103, "Early Hints", "Lets the browser start preloading resources while the server prepares the final response."),
  s(200, "OK", "The request succeeded."),
  s(201, "Created", "The request succeeded and a new resource was created."),
  s(202, "Accepted", "The request was accepted for processing, but processing is not complete."),
  s(203, "Non-Authoritative Information", "The response was modified by a transforming proxy."),
  s(204, "No Content", "The request succeeded and there is no body to return."),
  s(205, "Reset Content", "The client should reset the document view that sent the request."),
  s(206, "Partial Content", "Only part of the resource is being returned, as requested with a Range header."),
  s(207, "Multi-Status", "Multiple status codes might apply to a single request (WebDAV)."),
  s(301, "Moved Permanently", "The resource has a new permanent URL. Search engines transfer ranking."),
  s(302, "Found", "The resource is temporarily at another URL."),
  s(303, "See Other", "Fetch the response from another URL using GET."),
  s(304, "Not Modified", "The cached version is still valid; no body is sent."),
  s(307, "Temporary Redirect", "Repeat the request at another URL using the same method."),
  s(308, "Permanent Redirect", "The resource has a new permanent URL and the method must not change."),
  s(400, "Bad Request", "The server cannot process the request because of a client error such as malformed syntax."),
  s(401, "Unauthorized", "Authentication is required or has failed."),
  s(402, "Payment Required", "Reserved for future use; sometimes used for paywalls and quota limits."),
  s(403, "Forbidden", "The server understood the request but refuses to authorize it."),
  s(404, "Not Found", "The server cannot find the requested resource."),
  s(405, "Method Not Allowed", "The HTTP method is not supported for this resource."),
  s(406, "Not Acceptable", "The server cannot produce a response matching the Accept headers."),
  s(407, "Proxy Authentication Required", "Authentication with the proxy is required."),
  s(408, "Request Timeout", "The server timed out waiting for the request."),
  s(409, "Conflict", "The request conflicts with the current state of the resource."),
  s(410, "Gone", "The resource was permanently removed and will not return."),
  s(411, "Length Required", "The request needs a Content-Length header."),
  s(412, "Precondition Failed", "A condition in the request headers evaluated to false."),
  s(413, "Content Too Large", "The request body is larger than the server is willing to process."),
  s(414, "URI Too Long", "The request URI is longer than the server will interpret."),
  s(415, "Unsupported Media Type", "The request payload format is not supported."),
  s(416, "Range Not Satisfiable", "The requested range cannot be served."),
  s(417, "Expectation Failed", "The Expect header cannot be met."),
  s(418, "I'm a teapot", "The server refuses to brew coffee because it is, permanently, a teapot (RFC 2324 April Fools' joke)."),
  s(421, "Misdirected Request", "The request was sent to a server that cannot produce a response."),
  s(422, "Unprocessable Content", "The request is well-formed but contains semantic errors."),
  s(423, "Locked", "The resource is locked (WebDAV)."),
  s(424, "Failed Dependency", "The request failed because a previous request failed (WebDAV)."),
  s(425, "Too Early", "The server is unwilling to risk processing a request that might be replayed."),
  s(426, "Upgrade Required", "The client should switch to a different protocol."),
  s(428, "Precondition Required", "The server requires the request to be conditional."),
  s(429, "Too Many Requests", "The client has sent too many requests in a given time (rate limiting)."),
  s(431, "Request Header Fields Too Large", "The headers are too large for the server to process."),
  s(451, "Unavailable For Legal Reasons", "The resource is unavailable due to a legal demand."),
  s(500, "Internal Server Error", "The server encountered an unexpected condition."),
  s(501, "Not Implemented", "The server does not support the functionality required."),
  s(502, "Bad Gateway", "A gateway or proxy received an invalid response from the upstream server."),
  s(503, "Service Unavailable", "The server is not ready to handle the request, often due to maintenance or overload."),
  s(504, "Gateway Timeout", "A gateway or proxy did not receive a timely response from the upstream server."),
  s(505, "HTTP Version Not Supported", "The HTTP version used in the request is not supported."),
  s(506, "Variant Also Negotiates", "Content negotiation resulted in a circular reference."),
  s(507, "Insufficient Storage", "The server cannot store the representation needed to complete the request (WebDAV)."),
  s(508, "Loop Detected", "The server detected an infinite loop while processing the request (WebDAV)."),
  s(510, "Not Extended", "Further extensions to the request are required."),
  s(511, "Network Authentication Required", "The client needs to authenticate to gain network access."),
];

export function httpStatusClass(code: number): string {
  return (["Informational", "Success", "Redirection", "Client error", "Server error"] as const)[Math.floor(code / 100) - 1] ?? "Unknown";
}

export function searchHttpStatus(query: string): HttpStatus[] {
  const q = query.trim().toLowerCase();
  if (!q) return HTTP_STATUS;
  return HTTP_STATUS.filter((x) => String(x.code).startsWith(q) || x.name.toLowerCase().includes(q) || x.description.toLowerCase().includes(q));
}

export interface MimeType {
  extension: string;
  mime: string;
  description: string;
}

const m = (extension: string, mime: string, description: string): MimeType => ({ extension, mime, description });

export const MIME_TYPES: MimeType[] = [
  m("html", "text/html", "HTML document"), m("css", "text/css", "Cascading Style Sheet"), m("js", "text/javascript", "JavaScript"),
  m("mjs", "text/javascript", "JavaScript module"), m("json", "application/json", "JSON data"), m("xml", "application/xml", "XML document"),
  m("txt", "text/plain", "Plain text"), m("csv", "text/csv", "Comma-separated values"), m("md", "text/markdown", "Markdown"),
  m("yaml", "application/yaml", "YAML"), m("pdf", "application/pdf", "PDF document"), m("zip", "application/zip", "ZIP archive"),
  m("gz", "application/gzip", "Gzip archive"), m("tar", "application/x-tar", "Tape archive"), m("7z", "application/x-7z-compressed", "7-Zip archive"),
  m("png", "image/png", "PNG image"), m("jpg", "image/jpeg", "JPEG image"), m("jpeg", "image/jpeg", "JPEG image"), m("gif", "image/gif", "GIF image"),
  m("webp", "image/webp", "WebP image"), m("avif", "image/avif", "AVIF image"), m("svg", "image/svg+xml", "SVG vector image"),
  m("ico", "image/vnd.microsoft.icon", "Icon"), m("bmp", "image/bmp", "Bitmap image"), m("tiff", "image/tiff", "TIFF image"),
  m("mp3", "audio/mpeg", "MP3 audio"), m("wav", "audio/wav", "Waveform audio"), m("ogg", "audio/ogg", "Ogg audio"), m("flac", "audio/flac", "FLAC audio"),
  m("aac", "audio/aac", "AAC audio"), m("m4a", "audio/mp4", "MPEG-4 audio"), m("mp4", "video/mp4", "MP4 video"), m("webm", "video/webm", "WebM video"),
  m("mov", "video/quicktime", "QuickTime video"), m("avi", "video/x-msvideo", "AVI video"), m("mkv", "video/x-matroska", "Matroska video"),
  m("woff", "font/woff", "Web Open Font Format"), m("woff2", "font/woff2", "Web Open Font Format 2"), m("ttf", "font/ttf", "TrueType font"),
  m("otf", "font/otf", "OpenType font"), m("doc", "application/msword", "Word document (legacy)"),
  m("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Word document"),
  m("xls", "application/vnd.ms-excel", "Excel spreadsheet (legacy)"),
  m("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Excel spreadsheet"),
  m("ppt", "application/vnd.ms-powerpoint", "PowerPoint (legacy)"),
  m("pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "PowerPoint presentation"),
  m("epub", "application/epub+zip", "EPUB e-book"), m("wasm", "application/wasm", "WebAssembly module"), m("rtf", "application/rtf", "Rich Text Format"),
  m("ics", "text/calendar", "iCalendar"), m("vcf", "text/vcard", "vCard"), m("sh", "application/x-sh", "Shell script"),
  m("php", "application/x-httpd-php", "PHP script"), m("ts", "video/mp2t", "MPEG transport stream (not TypeScript)"),
  m("jsonld", "application/ld+json", "JSON-LD"), m("webmanifest", "application/manifest+json", "Web app manifest"),
];

export function lookupMime(query: string): MimeType[] {
  const q = query.trim().toLowerCase().replace(/^\./, "");
  if (!q) return MIME_TYPES;
  return MIME_TYPES.filter((x) => x.extension === q || x.mime.includes(q) || x.description.toLowerCase().includes(q));
}

export interface PortInfo {
  port: number;
  protocol: string;
  service: string;
}

const p = (port: number, protocol: string, service: string): PortInfo => ({ port, protocol, service });

export const COMMON_PORTS: PortInfo[] = [
  p(20, "TCP", "FTP data"), p(21, "TCP", "FTP control"), p(22, "TCP", "SSH / SFTP"), p(23, "TCP", "Telnet"), p(25, "TCP", "SMTP"), p(53, "TCP/UDP", "DNS"),
  p(67, "UDP", "DHCP server"), p(68, "UDP", "DHCP client"), p(80, "TCP", "HTTP"), p(110, "TCP", "POP3"), p(123, "UDP", "NTP"), p(143, "TCP", "IMAP"),
  p(161, "UDP", "SNMP"), p(389, "TCP", "LDAP"), p(443, "TCP", "HTTPS"), p(465, "TCP", "SMTPS"), p(514, "UDP", "Syslog"), p(587, "TCP", "SMTP submission"),
  p(636, "TCP", "LDAPS"), p(993, "TCP", "IMAPS"), p(995, "TCP", "POP3S"), p(1433, "TCP", "Microsoft SQL Server"), p(1521, "TCP", "Oracle Database"),
  p(2049, "TCP/UDP", "NFS"), p(2375, "TCP", "Docker (unencrypted)"), p(3000, "TCP", "Common dev servers (Node, Next.js, Grafana)"),
  p(3306, "TCP", "MySQL / MariaDB"), p(3389, "TCP", "Remote Desktop (RDP)"), p(5000, "TCP", "Flask / UPnP"), p(5173, "TCP", "Vite dev server"),
  p(5432, "TCP", "PostgreSQL"), p(5672, "TCP", "RabbitMQ (AMQP)"), p(5900, "TCP", "VNC"), p(6379, "TCP", "Redis"), p(8000, "TCP", "Common dev servers (Django)"),
  p(8080, "TCP", "HTTP alternate / proxies"), p(8443, "TCP", "HTTPS alternate"), p(9000, "TCP", "PHP-FPM / SonarQube"), p(9092, "TCP", "Apache Kafka"),
  p(9200, "TCP", "Elasticsearch"), p(11211, "TCP", "Memcached"), p(27017, "TCP", "MongoDB"),
];

export function lookupPort(query: string): PortInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return COMMON_PORTS;
  return COMMON_PORTS.filter((x) => String(x.port) === q || x.service.toLowerCase().includes(q) || x.protocol.toLowerCase() === q);
}

/* ------------------------------ chmod ------------------------------ */

export interface Permissions {
  owner: { r: boolean; w: boolean; x: boolean };
  group: { r: boolean; w: boolean; x: boolean };
  other: { r: boolean; w: boolean; x: boolean };
}

const digitToBits = (d: number) => ({ r: !!(d & 4), w: !!(d & 2), x: !!(d & 1) });
const bitsToDigit = (b: { r: boolean; w: boolean; x: boolean }) => (b.r ? 4 : 0) + (b.w ? 2 : 0) + (b.x ? 1 : 0);

export function octalToPermissions(octal: string): Permissions {
  if (!/^[0-7]{3,4}$/.test(octal)) throw new RangeError("Enter an octal mode such as 755 or 0644.");
  const [o, g, t] = octal.slice(-3).split("").map(Number) as [number, number, number];
  return { owner: digitToBits(o), group: digitToBits(g), other: digitToBits(t) };
}

export function permissionsToOctal(perms: Permissions): string {
  return `${bitsToDigit(perms.owner)}${bitsToDigit(perms.group)}${bitsToDigit(perms.other)}`;
}

export function permissionsToSymbolic(perms: Permissions): string {
  return [perms.owner, perms.group, perms.other].map((b) => `${b.r ? "r" : "-"}${b.w ? "w" : "-"}${b.x ? "x" : "-"}`).join("");
}

/** Parse `rwxr-xr-x` (optionally with a leading file-type character, as in `ls -l`). */
export function symbolicToPermissions(symbolic: string): Permissions {
  const text = symbolic.trim().length === 10 ? symbolic.trim().slice(1) : symbolic.trim();
  if (!/^[r-][w-][xsStT-][r-][w-][xsStT-][r-][w-][xsStT-]$/.test(text)) throw new RangeError("Enter nine characters such as rwxr-xr-x.");
  const triple = (t: string) => ({ r: t[0] === "r", w: t[1] === "w", x: /[xst]/.test(t[2] as string) });
  return { owner: triple(text.slice(0, 3)), group: triple(text.slice(3, 6)), other: triple(text.slice(6, 9)) };
}
