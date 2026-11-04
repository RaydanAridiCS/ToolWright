"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Alert, Button, FileDropzone, FileListItem } from "@toolwright/ui";
import { makeApng } from "@toolwright/core/apng-maker";
import { DownloadResult, JobError, RunButton, useJob } from "../../shared/pdf-ui";
import { errorMessage } from "../../shared/format";
import { NumberField, num } from "../../shared/number-field";

interface Frame {
  id: number;
  name: string;
  size: number;
  bytes: Uint8Array;
}

let nextId = 1;

export default function Tool() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [delay, setDelay] = useState("100");
  const [loops, setLoops] = useState("0");
  const job = useJob<Uint8Array>();

  const addFiles = async (files: File[]) => {
    setError(null);
    job.reset();
    const added: Frame[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/png") && !file.name.toLowerCase().endsWith(".png")) {
        setError(`${file.name}: only PNG files are supported.`);
        continue;
      }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        added.push({ id: nextId++, name: file.name, size: file.size, bytes });
      } catch (err) {
        setError(`${file.name}: ${errorMessage(err, "could not be read")}`);
      }
    }
    setFrames((current) => [...current, ...added]);
  };

  const move = (index: number, delta: number) => {
    job.reset();
    setFrames((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target] as Frame, next[index] as Frame];
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <FileDropzone
        accept=".png,image/png"
        multiple
        label="Drop PNG frames here, or click to browse"
        hint="Add two or more PNG frames. They must all be the same size. Your images never leave your device."
        onReject={setError}
        onFiles={addFiles}
      />
      {error ? <Alert tone="warning">{error}</Alert> : null}

      {frames.length > 0 ? (
        <>
          <ol className="flex flex-col gap-2">
            {frames.map((frame, i) => (
              <FileListItem
                key={frame.id}
                name={`${i + 1}. ${frame.name}`}
                size={frame.size}
                onRemove={() => {
                  job.reset();
                  setFrames((c) => c.filter((x) => x.id !== frame.id));
                }}
              >
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Move ${frame.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Move ${frame.name} down`} disabled={i === frames.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
              </FileListItem>
            ))}
          </ol>

          <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
            <NumberField label="Frame delay" suffix="ms" value={delay} onChange={setDelay} min={20} max={60000} step={10} />
            <NumberField label="Loops" suffix="0 = forever" value={loops} onChange={setLoops} min={0} max={0xffffffff} step={1} />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <RunButton
              busy={job.busy}
              disabled={frames.length < 2}
              onClick={() =>
                job.run(async () =>
                  makeApng(
                    frames.map((f) => f.bytes),
                    { delay: Math.max(20, num(delay) || 100), loops: num(loops) || 0 },
                  ),
                )
              }
            >
              Create APNG from {frames.length} frames
            </RunButton>
            <Button variant="ghost" onClick={() => (setFrames([]), job.reset())}>
              Clear all
            </Button>
            {frames.length < 2 ? <span className="text-sm text-muted-foreground">Add at least one more frame.</span> : null}
          </div>
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result ? <DownloadResult data={job.result} filename="animation.png" mime="image/png" note="Animated PNG" /> : null}
    </div>
  );
}
