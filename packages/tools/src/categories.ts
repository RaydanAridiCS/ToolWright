import { Binary, Braces, Calculator, FileText, Image as ImageIcon, Palette, Sparkles, Table2, Type, type LucideIcon } from "lucide-react";
import type { CategoryId } from "./define";

export interface Category {
  id: CategoryId;
  name: string;
  description: string;
  icon: LucideIcon;
}

export const CATEGORIES: Category[] = [
  { id: "text", name: "Text", description: "Count, clean, compare and transform text.", icon: Type },
  { id: "developer", name: "Developer", description: "Format, decode, test and inspect code and data.", icon: Braces },
  { id: "data", name: "Data converters", description: "Convert between JSON, YAML, CSV and more.", icon: Table2 },
  { id: "encoding", name: "Encoders & hashes", description: "Base64, URL encoding, hashes and escapes.", icon: Binary },
  { id: "image", name: "Image", description: "Compress, convert, resize and clean up images.", icon: ImageIcon },
  { id: "pdf", name: "PDF", description: "Merge, split, rotate and edit PDF files.", icon: FileText },
  { id: "design", name: "Color & design", description: "Colors, contrast, palettes and QR codes.", icon: Palette },
  { id: "generators", name: "Generators", description: "Passwords, unique IDs and placeholder text.", icon: Sparkles },
  { id: "calculators", name: "Calculators", description: "Units, dates, percentages, loans and more.", icon: Calculator },
];

export const CATEGORY_BY_ID: Record<CategoryId, Category> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, Category>;

export function isCategoryId(value: string): value is CategoryId {
  return value in CATEGORY_BY_ID;
}
