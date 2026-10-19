import type { ReactNode } from "react";

/** Shared layout for long-form pages (About, Privacy, Contribute): a wide display title and a comfortable 68ch measure. */
export function ProsePage({ title, intro, kicker, children }: { title: string; intro?: ReactNode; kicker?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="border-b-2 border-foreground pb-10">
        {kicker ? <p className="label-plate mb-3">{kicker}</p> : null}
        <h1 className="max-w-4xl font-display text-[clamp(2.8rem,7vw,5.8rem)] font-extrabold leading-[0.92] tracking-[-0.03em]">{title}</h1>
        {intro ? <p className="mt-6 max-w-2xl text-xl leading-relaxed">{intro}</p> : null}
      </header>
      <div className="prose-tw mt-12 text-[16.5px]">{children}</div>
    </div>
  );
}
