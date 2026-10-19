import { Camera } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "exif-viewer",
  name: "EXIF Viewer",
  tagline: "See the camera settings, date and GPS location hidden in a photo.",
  description:
    "Inspect the EXIF metadata embedded in your photos: camera and lens, exposure settings, capture date and GPS coordinates. Find out what you would be sharing before you post an image. Read locally in your browser.",
  category: "image",
  keywords: ["exif viewer", "photo metadata", "image metadata viewer", "gps from photo", "camera settings", "exif data reader"],
  icon: Camera,
  related: ["exif-remover", "image-compressor", "image-color-picker"],
});
