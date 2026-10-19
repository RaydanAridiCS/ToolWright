import type { ReactNode } from "react";

/** Shared layout for long-form pages (About, Privacy, Contribute). */
export function ProsePage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-balance text-4xl font-bold tracking-tight">{title}</h1>
      {intro ? <p className="mt-4 text-pretty text-lg text-muted-foreground">{intro}</p> : null}
      <div className="prose-tw mt-10 text-[15.5px]">{children}</div>
    </div>
  );
}
