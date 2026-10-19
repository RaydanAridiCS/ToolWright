/** Unit conversion. Every category is defined relative to a base unit (factor = base units per 1 of this unit). */

export interface UnitDef {
  id: string;
  label: string;
  symbol: string;
  factor: number;
}

export interface UnitCategory {
  id: string;
  label: string;
  base: string;
  units: UnitDef[];
}

const u = (id: string, label: string, symbol: string, factor: number): UnitDef => ({ id, label, symbol, factor });

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: "length",
    label: "Length",
    base: "meter",
    units: [
      u("nanometer", "Nanometers", "nm", 1e-9), u("micrometer", "Micrometers", "µm", 1e-6), u("millimeter", "Millimeters", "mm", 1e-3),
      u("centimeter", "Centimeters", "cm", 1e-2), u("meter", "Meters", "m", 1), u("kilometer", "Kilometers", "km", 1000),
      u("inch", "Inches", "in", 0.0254), u("foot", "Feet", "ft", 0.3048), u("yard", "Yards", "yd", 0.9144),
      u("mile", "Miles", "mi", 1609.344), u("nautical-mile", "Nautical miles", "nmi", 1852),
    ],
  },
  {
    id: "mass",
    label: "Mass / weight",
    base: "kilogram",
    units: [
      u("microgram", "Micrograms", "µg", 1e-9), u("milligram", "Milligrams", "mg", 1e-6), u("gram", "Grams", "g", 1e-3),
      u("kilogram", "Kilograms", "kg", 1), u("tonne", "Metric tonnes", "t", 1000), u("ounce", "Ounces", "oz", 0.028349523125),
      u("pound", "Pounds", "lb", 0.45359237), u("stone", "Stone", "st", 6.35029318), u("us-ton", "US tons", "ton", 907.18474),
    ],
  },
  {
    id: "volume",
    label: "Volume",
    base: "liter",
    units: [
      u("milliliter", "Milliliters", "mL", 1e-3), u("liter", "Liters", "L", 1), u("cubic-meter", "Cubic meters", "m³", 1000),
      u("teaspoon", "Teaspoons (US)", "tsp", 0.00492892159375), u("tablespoon", "Tablespoons (US)", "tbsp", 0.01478676478125),
      u("fluid-ounce", "Fluid ounces (US)", "fl oz", 0.0295735295625), u("cup", "Cups (US)", "cup", 0.2365882365),
      u("pint", "Pints (US)", "pt", 0.473176473), u("quart", "Quarts (US)", "qt", 0.946352946), u("gallon", "Gallons (US)", "gal", 3.785411784),
      u("imperial-gallon", "Gallons (UK)", "imp gal", 4.54609),
    ],
  },
  {
    id: "area",
    label: "Area",
    base: "square-meter",
    units: [
      u("square-millimeter", "Square millimeters", "mm²", 1e-6), u("square-centimeter", "Square centimeters", "cm²", 1e-4),
      u("square-meter", "Square meters", "m²", 1), u("hectare", "Hectares", "ha", 10000), u("square-kilometer", "Square kilometers", "km²", 1e6),
      u("square-inch", "Square inches", "in²", 0.00064516), u("square-foot", "Square feet", "ft²", 0.09290304),
      u("square-yard", "Square yards", "yd²", 0.83612736), u("acre", "Acres", "ac", 4046.8564224), u("square-mile", "Square miles", "mi²", 2589988.110336),
    ],
  },
  {
    id: "speed",
    label: "Speed",
    base: "meter-per-second",
    units: [
      u("meter-per-second", "Meters per second", "m/s", 1), u("kilometer-per-hour", "Kilometers per hour", "km/h", 1 / 3.6),
      u("mile-per-hour", "Miles per hour", "mph", 0.44704), u("knot", "Knots", "kn", 0.514444444), u("foot-per-second", "Feet per second", "ft/s", 0.3048),
      u("mach", "Mach (sea level)", "Ma", 340.29),
    ],
  },
  {
    id: "time",
    label: "Time",
    base: "second",
    units: [
      u("millisecond", "Milliseconds", "ms", 1e-3), u("second", "Seconds", "s", 1), u("minute", "Minutes", "min", 60), u("hour", "Hours", "h", 3600),
      u("day", "Days", "d", 86400), u("week", "Weeks", "wk", 604800), u("month", "Months (30.44 d)", "mo", 2629800), u("year", "Years (365.25 d)", "yr", 31557600),
    ],
  },
  {
    id: "data",
    label: "Digital storage",
    base: "byte",
    units: [
      u("bit", "Bits", "bit", 1 / 8), u("byte", "Bytes", "B", 1), u("kilobyte", "Kilobytes (1000)", "KB", 1e3), u("megabyte", "Megabytes (1000²)", "MB", 1e6),
      u("gigabyte", "Gigabytes (1000³)", "GB", 1e9), u("terabyte", "Terabytes (1000⁴)", "TB", 1e12), u("petabyte", "Petabytes (1000⁵)", "PB", 1e15),
      u("kibibyte", "Kibibytes (1024)", "KiB", 1024), u("mebibyte", "Mebibytes (1024²)", "MiB", 1024 ** 2), u("gibibyte", "Gibibytes (1024³)", "GiB", 1024 ** 3),
      u("tebibyte", "Tebibytes (1024⁴)", "TiB", 1024 ** 4),
    ],
  },
  {
    id: "energy",
    label: "Energy",
    base: "joule",
    units: [
      u("joule", "Joules", "J", 1), u("kilojoule", "Kilojoules", "kJ", 1000), u("calorie", "Calories (thermochemical)", "cal", 4.184),
      u("kilocalorie", "Kilocalories (food)", "kcal", 4184), u("watt-hour", "Watt-hours", "Wh", 3600), u("kilowatt-hour", "Kilowatt-hours", "kWh", 3.6e6),
      u("btu", "BTU (IT)", "BTU", 1055.05585262), u("electronvolt", "Electronvolts", "eV", 1.602176634e-19),
    ],
  },
  {
    id: "pressure",
    label: "Pressure",
    base: "pascal",
    units: [
      u("pascal", "Pascals", "Pa", 1), u("kilopascal", "Kilopascals", "kPa", 1000), u("bar", "Bar", "bar", 1e5), u("psi", "Pounds per sq inch", "psi", 6894.757293168),
      u("atmosphere", "Atmospheres", "atm", 101325), u("mmhg", "Millimeters of mercury", "mmHg", 133.322387415),
    ],
  },
  {
    id: "angle",
    label: "Angle",
    base: "degree",
    units: [u("degree", "Degrees", "°", 1), u("radian", "Radians", "rad", 180 / Math.PI), u("gradian", "Gradians", "grad", 0.9), u("turn", "Turns", "turn", 360)],
  },
];

export type TemperatureUnit = "celsius" | "fahrenheit" | "kelvin" | "rankine";

export const TEMPERATURE_UNITS: { id: TemperatureUnit; label: string; symbol: string }[] = [
  { id: "celsius", label: "Celsius", symbol: "°C" },
  { id: "fahrenheit", label: "Fahrenheit", symbol: "°F" },
  { id: "kelvin", label: "Kelvin", symbol: "K" },
  { id: "rankine", label: "Rankine", symbol: "°R" },
];

export function convertTemperature(value: number, from: TemperatureUnit, to: TemperatureUnit): number {
  const kelvin =
    from === "celsius" ? value + 273.15 : from === "fahrenheit" ? ((value - 32) * 5) / 9 + 273.15 : from === "rankine" ? (value * 5) / 9 : value;
  switch (to) {
    case "celsius":
      return kelvin - 273.15;
    case "fahrenheit":
      return ((kelvin - 273.15) * 9) / 5 + 32;
    case "rankine":
      return (kelvin * 9) / 5;
    default:
      return kelvin;
  }
}

export function getCategory(id: string): UnitCategory {
  const category = UNIT_CATEGORIES.find((c) => c.id === id);
  if (!category) throw new RangeError(`Unknown unit category "${id}".`);
  return category;
}

export function convertUnit(value: number, categoryId: string, from: string, to: string): number {
  const category = getCategory(categoryId);
  const a = category.units.find((x) => x.id === from);
  const b = category.units.find((x) => x.id === to);
  if (!a || !b) throw new RangeError("Unknown unit.");
  return (value * a.factor) / b.factor;
}

/** Format with sensible precision, avoiding long float tails. */
export function formatNumber(value: number, significant = 8): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e15 || abs < 1e-6) return value.toExponential(Math.max(0, significant - 1)).replace(/\.?0+e/, "e");
  return String(Number(value.toPrecision(significant)));
}

export function formatBytes(bytes: number, options: { binary?: boolean; decimals?: number } = {}): string {
  const { binary = false, decimals = 2 } = options;
  if (!Number.isFinite(bytes)) return String(bytes);
  const base = binary ? 1024 : 1000;
  const units = binary ? ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] : ["B", "KB", "MB", "GB", "TB", "PB"];
  const abs = Math.abs(bytes);
  const i = abs < base ? 0 : Math.min(units.length - 1, Math.floor(Math.log(abs) / Math.log(base)));
  const value = bytes / base ** i;
  return `${i === 0 ? value : value.toFixed(decimals).replace(/\.?0+$/, "")} ${units[i]}`;
}
