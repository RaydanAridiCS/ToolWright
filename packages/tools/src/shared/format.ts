/** Small formatting helpers shared by tool UIs. */

export const formatInt = (n: number) => n.toLocaleString("en-US");

export function formatMinutes(minutes: number): string {
  if (minutes < 1 / 60) return "0 sec";
  const totalSeconds = Math.round(minutes * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m} min${s ? ` ${s} sec` : ""}` : `${s} sec`;
}

export function formatMoney(value: number, currency = "USD"): string {
  return value.toLocaleString("en-US", { style: "currency", currency });
}

export function formatPercent(value: number, digits = 2): string {
  return `${Number(value.toFixed(digits))}%`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatInt(count)} ${count === 1 ? singular : plural}`;
}

export function errorMessage(err: unknown, fallback = "Something went wrong."): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
