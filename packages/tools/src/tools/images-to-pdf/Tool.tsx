"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Alert, Button, Field, FileDropzone, Select, Toggle, formatFileSize } from "@toolwright/ui";
import { PAGE_SIZES, imagesToPdf, type ImageInput } from "@toolwright/core/pdf";
import { detectImageKind } from "@toolwright/core/image-meta";
import { blobToBytes, loadImage, renderImage } from "../../shared/image";
import { DownloadResult, JobError, RunButton, useJob } from "../../shared/pdf-ui";
import { NumberField, num } from "../../shared/number-field";

interface Item {
  id: number;
  name: string;
  size: number;
  file: File;
  preview: string;
}

let nextId = 1;

export default function Tool() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState("a4");
  const [landscape, setLandscape] = useState(false);
  const [margin, setMargin] = useState("24");
  const job = useJob<{ data: Uint8Array; pages: number }>();
  const previews = useRef<string[]>([]);

  useEffect(
    () => () => {
      previews.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  const add = (files: File[]) => {
    job.reset();
    const added = files.map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      return { id: nextId++, name: file.name, size: file.size, file, preview };
    });
    setItems((c) => [...c, ...added]);
  };

  const move = (i: number, d: number) =>
    setItems((c) => {
      const next = [...c];
      const t = i + d;
      if (t < 0 || t >= next.length) return c;
      [next[i], next[t]] = [next[t] as Item, next[i] as Item];
      return next;
    });

  const build = async () => {
    const images: ImageInput[] = [];
    for (const item of items) {
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      const kind = detectImageKind(bytes);
      if (kind === "jpeg") images.push({ data: bytes, type: "jpeg" });
      else if (kind === "png") images.push({ data: bytes, type: "png" });
      else {
        // WebP, GIF, BMP… are re-encoded as PNG so pdf-lib can embed them.
        const decoded = await loadImage(item.file);
        try {
          const png = await renderImage(decoded, { width: decoded.width, height: decoded.height, type: "image/png" });
          images.push({ data: await blobToBytes(png.blob), type: "png" });
        } finally {
          decoded.dispose();
        }
      }
    }
    return { data: await imagesToPdf(images, { pageSize: pageSize as "fit" | keyof typeof PAGE_SIZES, landscape, margin: Math.max(0, num(margin) || 0) }), pages: images.length };
  };

  return (
    <div className="flex flex-col gap-5">
      <FileDropzone accept="image/*" multiple label="Drop images here, or click to browse" hint="JPG, PNG, WebP, GIF and BMP work. Files never leave your device." onReject={setError} onFiles={add} />
      {error ? <Alert tone="warning">{error}</Alert> : null}

      {items.length > 0 ? (
        <>
          <ol className="grid gap-2 sm:grid-cols-2">
            {items.map((item, i) => (
              <li key={item.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.preview} alt="" className="size-14 shrink-0 rounded-md border border-border object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={item.name}>
                    {i + 1}. {item.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(item.size)}</p>
                </div>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Move ${item.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Move ${item.name} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Remove ${item.name}`} onClick={() => (URL.revokeObjectURL(item.preview), setItems((c) => c.filter((x) => x.id !== item.id)), job.reset())}>
                  <X />
                </Button>
              </li>
            ))}
          </ol>

          <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
            <Field label="Page size">
              {(id) => (
                <Select id={id} value={pageSize} onChange={(e) => (setPageSize(e.target.value), job.reset())}>
                  <option value="a4">A4</option>
                  <option value="letter">US Letter</option>
                  <option value="legal">US Legal</option>
                  <option value="a5">A5</option>
                  <option value="fit">Fit to each image</option>
                </Select>
              )}
            </Field>
            <NumberField label="Margin (points)" value={margin} onChange={setMargin} min={0} max={200} hint="72 points = 1 inch" />
            <Toggle label="Landscape pages" checked={landscape} onCheckedChange={setLandscape} className="self-center" />
          </div>

          <div className="flex items-center gap-4">
            <RunButton busy={job.busy} onClick={() => job.run(build)}>
              Create PDF from {items.length} image{items.length === 1 ? "" : "s"}
            </RunButton>
            <Button variant="ghost" onClick={() => (items.forEach((i) => URL.revokeObjectURL(i.preview)), setItems([]), job.reset())}>
              Clear all
            </Button>
          </div>
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result ? <DownloadResult data={job.result.data} filename="images.pdf" note={`${job.result.pages} page${job.result.pages === 1 ? "" : "s"}`} /> : null}
    </div>
  );
}
