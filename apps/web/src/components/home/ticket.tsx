"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@toolwright/ui";

/** "Missing a tool?": a ticket stub whose number is the next free catalogue number. Submitting prefills the request board. */
export function Ticket({ nextNumber }: { nextNumber: number }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const id = useId();
  const no = String(nextNumber).padStart(3, "0");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const query = title.trim() ? `?title=${encodeURIComponent(title.trim())}` : "";
        router.push(`/requests${query}`);
      }}
      className="relative grid border border-foreground bg-card shadow-md md:grid-cols-[1fr_auto]"
    >
      <div className="p-6 sm:p-8">
        <h2 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">Tool {no} is yours to name.</h2>
        <p className="mt-2 max-w-md text-muted-foreground">Tell us the job you keep doing by hand. The most-wanted ideas get built first, and anyone can build one.</p>
        <div className="mt-5 flex max-w-lg flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor={id}>What should we build?</Label>
            <Input id={id} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Compare two JSON files" />
          </div>
          <Button type="submit" variant="primary" size="md">
            Add to the board
          </Button>
        </div>
      </div>

      {/* The stub: a perforated edge, with a notch cut out top and bottom. */}
      <div aria-hidden className="relative hidden w-44 flex-col items-center justify-center gap-1 border-l-2 border-dashed border-foreground p-6 md:flex">
        <span className="absolute -left-[11px] -top-[11px] size-5 rounded-full border border-foreground bg-background" />
        <span className="absolute -bottom-[11px] -left-[11px] size-5 rounded-full border border-foreground bg-background" />
        <span className="label-plate">No.</span>
        <span className="font-display text-6xl font-extrabold leading-none tabular-nums">{no}</span>
        <span className="label-plate mt-2">Unclaimed</span>
      </div>
    </form>
  );
}
