import { Droplets } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "image-color-picker",
  name: "Image Color Picker",
  tagline: "Pick exact colors from any image and extract its dominant palette.",
  description:
    "Click anywhere on an image to read the exact HEX and RGB value, and see the dominant colors extracted automatically. Perfect for matching brand colors from a logo or screenshot. Runs on your device.",
  category: "design",
  keywords: ["image color picker", "color from image", "eyedropper", "extract colors from image", "dominant colors", "palette from photo"],
  icon: Droplets,
  related: ["color-converter", "palette-generator", "contrast-checker"],
});
