"use client";

import { useMemo, useState } from "react";
import { Pipette } from "lucide-react";
import { Alert, Button, Field, Input, useShareableState } from "@toolwright/ui";
import { formatColor, parseColor, readableTextColor, rgbToHex } from "@toolwright/core/color";
import { ResultRow } from "../../shared/result-row";

interface EyeDropperLike {
  open: () => Promise<{ sRGBHex: string }>;
}

export default function Tool() {
  const { state, setState } = useShareableState({ color: "#0b6b55" });
  const [pickError, setPickError] = useState<string | null>(null);
  const parsed = useMemo(() => parseColor(state.color), [state.color]);
  const formats = parsed ? formatColor(parsed) : null;
  const eyeDropper = typeof window !== "undefined" ? (window as unknown as { EyeDropper?: new () => EyeDropperLike }).EyeDropper : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-[16rem_1fr]">
        <div
          className="flex min-h-40 items-end border border-foreground p-4 font-mono text-sm"
          style={{ background: parsed ? `${formats?.hex}` : "transparent", color: parsed ? readableTextColor(parsed) : undefined }}
          aria-label="Color preview"
        >
          {formats?.hex ?? "Invalid color"}
        </div>
        <div className="flex flex-col gap-4">
          <Field label="Color" hint="HEX (#0b6b55), rgb(11 107 85), hsl(166 81% 23%) or a name like seagreen.">
            {(id) => (
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Pick a color"
                  className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-1"
                  value={parsed ? rgbToHex({ ...parsed, a: 1 }) : "#000000"}
                  onChange={(e) => setState({ color: e.target.value })}
                />
                <Input id={id} mono value={state.color} onChange={(e) => setState({ color: e.target.value })} />
                {eyeDropper ? (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        setPickError(null);
                        const { sRGBHex } = await new eyeDropper().open();
                        setState({ color: sRGBHex });
                      } catch {
                        setPickError("Eyedropper was cancelled or is unavailable.");
                      }
                    }}
                  >
                    <Pipette /> Pick from screen
                  </Button>
                ) : null}
              </div>
            )}
          </Field>
          {pickError ? <Alert tone="warning">{pickError}</Alert> : null}
          {!parsed && state.color.trim() ? <Alert tone="error">That is not a color I can read.</Alert> : null}
        </div>
      </div>

      {formats ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ResultRow label="HEX" value={formats.hex} />
          <ResultRow label="RGB" value={formats.rgb} />
          <ResultRow label="HSL" value={formats.hsl} />
          <ResultRow label="HSV" value={formats.hsv} />
          <ResultRow label="CMYK" value={formats.cmyk} />
          <ResultRow label="OKLCH" value={formats.oklch} />
        </div>
      ) : null}
    </div>
  );
}
