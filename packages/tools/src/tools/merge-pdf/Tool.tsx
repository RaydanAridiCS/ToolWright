"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Alert, Button, FileDropzone, FileListItem } from "@toolwright/ui";
import { getPdfInfo, isPdf, mergePdfs } from "@toolwright/core/pdf";
import { DownloadResult, JobError, RunButton, useJob } from "../../shared/pdf-ui";
import { errorMessage } from "../../shared/format";

interface Item {
  id: number;
  name: string;
  size: number;
  pages: number;
  bytes: Uint8Array;
}

let nextId = 1;

export default function Tool() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const job = useJob<Uint8Array>();

  const addFiles = async (files: File[]) => {
    setError(null);
    job.reset();
    const added: Item[] = [];
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!isPdf(bytes)) throw new Error("not a PDF");
        const info = await getPdfInfo(bytes);
        added.push({ id: nextId++, name: file.name, size: file.size, pages: info.pageCount, bytes });
      } catch (err) {
        setError(`${file.name}: ${errorMessage(err, "could not be read")}`);
      }
    }
    setItems((current) => [...current, ...added]);
  };

  const move = (index: number, delta: number) => {
    job.reset();
    setItems((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target] as Item, next[index] as Item];
      return next;
    });
  };

  const totalPages = items.reduce((n, i) => n + i.pages, 0);

  return (
    <div className="flex flex-col gap-5">
      <FileDropzone accept=".pdf,application/pdf" multiple label="Drop PDFs here, or click to browse" hint="Add two or more PDF files. They never leave your device." onReject={setError} onFiles={addFiles} />
      {error ? <Alert tone="warning">{error}</Alert> : null}

      {items.length > 0 ? (
        <>
          <ol className="flex flex-col gap-2">
            {items.map((item, i) => (
              <FileListItem
                key={item.id}
                name={`${i + 1}. ${item.name}`}
                size={item.size}
                detail={`${item.pages} page${item.pages === 1 ? "" : "s"}`}
                onRemove={() => {
                  job.reset();
                  setItems((c) => c.filter((x) => x.id !== item.id));
                }}
              >
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Move ${item.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Move ${item.name} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
              </FileListItem>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <RunButton busy={job.busy} disabled={items.length < 2} onClick={() => job.run(() => mergePdfs(items.map((i) => i.bytes)))}>
              Merge {items.length} PDFs ({totalPages} pages)
            </RunButton>
            <Button variant="ghost" onClick={() => (setItems([]), job.reset())}>
              Clear all
            </Button>
            {items.length < 2 ? <span className="text-sm text-muted-foreground">Add at least one more PDF.</span> : null}
          </div>
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result ? <DownloadResult data={job.result} filename="merged.pdf" note={`${totalPages} pages`} /> : null}
    </div>
  );
}
