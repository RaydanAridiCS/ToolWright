import { FolderLock } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "chmod-calculator",
  name: "Chmod Calculator",
  tagline: "Convert Linux file permissions between octal and rwx notation.",
  description: "Tick read, write and execute boxes for owner, group and others to get the octal mode (like 755) and the symbolic form (rwxr-xr-x), or type either one. Includes a ready-to-copy chmod command.",
  category: "developer",
  keywords: ["chmod calculator", "linux permissions", "file permissions", "chmod 755", "octal permissions", "rwx"],
  icon: FolderLock,
  related: ["port-numbers", "number-base-converter", "http-status-codes"],
});
