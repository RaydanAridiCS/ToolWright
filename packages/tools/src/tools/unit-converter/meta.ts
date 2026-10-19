import { Ruler } from "lucide-react";
import { defineTool } from "../../define";

export default defineTool({
  slug: "unit-converter",
  name: "Unit Converter",
  tagline: "Length, weight, temperature, volume, speed, data size and more.",
  description:
    "Convert between metric and imperial units across length, mass, temperature, volume, area, speed, time, digital storage, energy, pressure and angle. Instant results with a full conversion table. Works offline.",
  category: "calculators",
  keywords: ["unit converter", "metric to imperial", "cm to inches", "kg to lbs", "celsius to fahrenheit", "mb to gb", "mph to kph"],
  icon: Ruler,
  popular: true,
  related: ["percentage-calculator", "number-base-converter", "date-calculator"],
});
