"use client";

import { useMemo } from "react";
import { Check, Trash2 } from "lucide-react";
import { Button } from "@toolwright/ui";
import { PageThumb, useThumbnails } from "./pdf-thumbs";

export interface PdfPageSelectorProps {
  file: File;
  pageCount: number;
  selectedIndexes: number[];
  onSelectionChange: (indexes: number[]) => void;
  mode: "keep" | "delete";
  maxThumbnails?: number;
}

export function PdfPageSelector({
  file,
  pageCount,
  selectedIndexes,
  onSelectionChange,
  mode,
  maxThumbnails = 150,
}: PdfPageSelectorProps) {
  const thumbs = useThumbnails(file);
  const selectedSet = useMemo(() => new Set(selectedIndexes), [selectedIndexes]);

  const togglePage = (index: number) => {
    const next = new Set(selectedSet);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    onSelectionChange(Array.from(next));
  };

  const selectAll = () => {
    onSelectionChange(Array.from({ length: pageCount }, (_, i) => i));
  };

  const selectNone = () => {
    onSelectionChange([]);
  };

  const invertSelection = () => {
    const next: number[] = [];
    for (let i = 0; i < pageCount; i++) {
      if (!selectedSet.has(i)) next.push(i);
    }
    onSelectionChange(next);
  };

  const isDeleting = mode === "delete";
  const displayCount = Math.min(pageCount, maxThumbnails);
  const isCapped = pageCount > maxThumbnails;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={selectAll}>
            {isDeleting ? "Select all to delete" : "Select all"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={selectedIndexes.length === 0} onClick={selectNone}>
            Clear
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={invertSelection}>
            Invert
          </Button>
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {isDeleting
            ? `${selectedSet.size} of ${pageCount} pages marked to delete (${pageCount - selectedSet.size} kept)`
            : `${selectedSet.size} of ${pageCount} pages selected to keep`}
        </p>
      </div>

      {thumbs.failed ? (
        <p className="text-xs text-muted-foreground">Previews could not be rendered, but you can still click pages to select them.</p>
      ) : null}

      <div
        className="grid max-h-96 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-border bg-muted/20 p-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
        role="group"
        aria-label="PDF pages"
      >
        {Array.from({ length: displayCount }, (_, i) => {
          const isSelected = selectedSet.has(i);
          const pageNum = i + 1;

          let cardStyle = "border-border bg-card text-foreground hover:border-foreground/40";
          if (isSelected) {
            if (isDeleting) {
              cardStyle = "border-destructive bg-destructive/10 text-destructive";
            } else {
              cardStyle = "border-foreground bg-accent/20 text-foreground font-medium";
            }
          }

          return (
            <button
              key={i}
              type="button"
              onClick={() => togglePage(i)}
              aria-pressed={isSelected}
              aria-label={`Page ${pageNum}, ${isSelected ? (isDeleting ? "marked for deletion" : "selected") : "not selected"}`}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${cardStyle}`}
            >
              <div className="flex w-full items-center justify-between text-xs">
                <span className="font-mono text-muted-foreground">p. {pageNum}</span>
                {isSelected ? (
                  isDeleting ? (
                    <span className="flex items-center gap-0.5 text-[10px] text-destructive">
                      <Trash2 className="size-3" aria-hidden /> Delete
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[10px] text-foreground">
                      <Check className="size-3" aria-hidden /> Keep
                    </span>
                  )
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    {isDeleting ? "Keep" : "Skip"}
                  </span>
                )}
              </div>
              <PageThumb
                store={thumbs.store}
                pageIndex={i}
                turn={0}
                className="grid h-24 w-full place-items-center overflow-hidden border border-border bg-background"
              />
            </button>
          );
        })}
      </div>

      {isCapped ? (
        <p className="text-xs text-muted-foreground">
          Showing previews for the first {maxThumbnails} pages. You can still target all {pageCount} pages using the text box above.
        </p>
      ) : null}
    </div>
  );
}
