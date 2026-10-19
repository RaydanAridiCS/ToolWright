import { FileType } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "mime-types",
  name: "MIME Type Lookup",
  tagline: "Find the Content-Type for any file extension.",
  description: "Search common MIME types by file extension or media type, such as .png → image/png or application/json. Handy for HTTP headers, uploads and server configuration.",
  category: "developer",
  keywords: ["mime types", "content-type", "file extension to mime", "media type", "mime type list"],
  icon: FileType,
  related: ["http-status-codes", "port-numbers", "image-to-base64"],
});
