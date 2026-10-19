import { Palette } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "palette-generator",
  name: "Color Palette Generator",
  tagline: "Build a 50–900 color scale and harmonies from one base color.",
  description:
    "Turn a single base color into a ten-step scale (50–900) and matching complementary, analogous, triadic, tetradic or monochromatic harmonies. Export as CSS variables or a Tailwind color object. Local only.",
  category: "design",
  keywords: ["color palette generator", "tailwind colors", "color scale", "color harmony", "shades generator", "css variables"],
  icon: Palette,
  related: ["color-converter", "contrast-checker", "image-color-picker"],
});
