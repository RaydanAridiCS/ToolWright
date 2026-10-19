/** Lorem ipsum placeholder text. */

const WORDS = (
  "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis " +
  "nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla " +
  "pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus " +
  "nunc posuere vestibulum ante primis faucibus orci luctus ultrices cubilia curae donec sagittis feugiat mauris vitae risus fringilla suscipit integer " +
  "maecenas eget dictum mi pharetra metus aenean euismod bibendum neque gravida volutpat turpis porta"
).split(" ");

export type LoremUnit = "paragraphs" | "sentences" | "words";

export interface LoremOptions {
  count?: number;
  unit?: LoremUnit;
  /** Begin with the classic "Lorem ipsum dolor sit amet". */
  classicStart?: boolean;
  /** Wrap each paragraph in <p> tags. */
  html?: boolean;
}

const START = ["lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit"];

export function generateLorem(options: LoremOptions = {}, random: () => number = Math.random): string {
  const { count = 3, unit = "paragraphs", classicStart = true, html = false } = options;
  if (count < 1 || count > 1000) throw new RangeError("Count must be between 1 and 1000.");
  const pick = () => WORDS[Math.floor(random() * WORDS.length)] as string;
  const words = (n: number, start: boolean) => {
    const out = start ? START.slice(0, Math.min(n, START.length)) : [];
    while (out.length < n) out.push(pick());
    return out;
  };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const sentence = (start: boolean) => {
    const n = 8 + Math.floor(random() * 10);
    const w = words(n, start);
    // Sprinkle a comma into longer sentences.
    if (n > 11) w[Math.floor(n / 2)] += ",";
    return `${cap(w.join(" "))}.`;
  };

  if (unit === "words") return cap(words(count, classicStart).join(" ")) + ".";
  if (unit === "sentences") return Array.from({ length: count }, (_, i) => sentence(classicStart && i === 0)).join(" ");
  const paragraphs = Array.from({ length: count }, (_, p) => {
    const sentences = 3 + Math.floor(random() * 4);
    return Array.from({ length: sentences }, (_, s) => sentence(classicStart && p === 0 && s === 0)).join(" ");
  });
  return html ? paragraphs.map((p) => `<p>${p}</p>`).join("\n") : paragraphs.join("\n\n");
}
