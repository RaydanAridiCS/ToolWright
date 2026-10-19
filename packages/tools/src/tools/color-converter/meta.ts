import { Pipette } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "color-converter",
  name: "Color Converter & Picker",
  tagline: "Convert between HEX, RGB, HSL, HSV, CMYK and OKLCH.",
  description:
    "Pick or type a color and get it in HEX, RGB, HSL, HSV, CMYK and OKLCH, ready to copy. Supports alpha, CSS color names and the browser eyedropper where available. Runs entirely on your device.",
  category: "design",
  keywords: ["color converter", "hex to rgb", "rgb to hex", "hsl converter", "color picker", "oklch", "css colors"],
  icon: Pipette,
  popular: true,
  related: ["contrast-checker", "palette-generator", "image-color-picker"],
});
