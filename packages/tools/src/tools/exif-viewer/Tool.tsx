"use client";

import { useEffect, useMemo, useState } from "react";
import { parse } from "exifr";
import { Alert, Badge, FileDropzone, Input, Panel, ScrollArea, formatFileSize } from "@toolwright/ui";
import { ResultRow } from "../../shared/result-row";
import { errorMessage } from "../../shared/format";

type Tags = Record<string, unknown>;

const SUMMARY: { label: string; keys: string[] }[] = [
  { label: "Camera", keys: ["Make", "Model"] },
  { label: "Lens", keys: ["LensModel", "LensMake"] },
  { label: "Taken", keys: ["DateTimeOriginal", "CreateDate"] },
  { label: "Exposure", keys: ["ExposureTime"] },
  { label: "Aperture", keys: ["FNumber"] },
  { label: "ISO", keys: ["ISO"] },
  { label: "Focal length", keys: ["FocalLength"] },
  { label: "Software", keys: ["Software"] },
  { label: "Dimensions", keys: ["ExifImageWidth", "ExifImageHeight"] },
];

function show(value: unknown): string {
  if (value instanceof Date) return value.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
  if (Array.isArray(value)) return value.join(", ");
  if (value instanceof Uint8Array) return `${value.length} bytes`;
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

function summaryValue(tags: Tags, label: string, keys: string[]): string | null {
  const values = keys.map((k) => tags[k]).filter((v) => v !== undefined && v !== null && v !== "");
  if (values.length === 0) return null;
  if (label === "Exposure") return `${tags.ExposureTime} s${typeof tags.ExposureTime === "number" && tags.ExposureTime < 1 ? ` (1/${Math.round(1 / tags.ExposureTime)})` : ""}`;
  if (label === "Aperture") return `f/${tags.FNumber}`;
  if (label === "Focal length") return `${tags.FocalLength} mm`;
  if (label === "Dimensions") return values.length === 2 ? `${values[0]} × ${values[1]} px` : show(values[0]);
  return values.map(show).join(" ");
}

export default function Tool() {
  const [file, setFile] = useState<File | null>(null);
  const [tags, setTags] = useState<Tags | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!file) {
      setTags(null);
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    let cancelled = false;
    parse(file, { tiff: true, exif: true, gps: true, xmp: true, icc: false, iptc: true, jfif: true, ifd1: false, mergeOutput: true, translateValues: true, reviveValues: true })
      .then((result: Tags | undefined) => {
        if (cancelled) return;
        setTags(result ?? {});
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTags(null);
        setError(errorMessage(err, "Metadata could not be read from this file."));
      });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const entries = useMemo(() => {
    if (!tags) return [];
    const q = query.trim().toLowerCase();
    return Object.entries(tags)
      .filter(([k, v]) => !(v instanceof Uint8Array) && (!q || k.toLowerCase().includes(q) || show(v).toLowerCase().includes(q)))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [tags, query]);

  const lat = typeof tags?.latitude === "number" ? tags.latitude : null;
  const lng = typeof tags?.longitude === "number" ? tags.longitude : null;
  const hasGps = lat !== null && lng !== null;

  return (
    <div className="flex flex-col gap-5">
      {file ? null : <FileDropzone accept="image/*,.heic,.heif" label="Drop a photo here, or click to browse" hint="Read on your device. The photo is never uploaded." onReject={setError} onFiles={([f]) => (setError(null), f && setFile(f))} />}
      {error ? <Alert tone="error">{error}</Alert> : null}

      {file && tags ? (
        <>
          <div className="flex flex-wrap items-start gap-5 rounded-xl border border-border bg-card p-4">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt={`Preview of ${file.name}`} className="max-h-48 max-w-full rounded-lg border border-border object-contain" />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" title={file.name}>
                {file.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatFileSize(file.size)} · {file.type || "unknown type"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone={hasGps ? "danger" : "success"}>{hasGps ? "Contains GPS location" : "No GPS location"}</Badge>
                <Badge>{Object.keys(tags).length} fields</Badge>
              </div>
              <button type="button" onClick={() => setFile(null)} className="mt-3 text-sm font-medium text-primary underline-offset-2 hover:underline">
                Choose another photo
              </button>
            </div>
          </div>

          {hasGps ? (
            <Alert tone="warning" title="This photo reveals where it was taken.">
              Coordinates {lat!.toFixed(5)}, {lng!.toFixed(5)}.{" "}
              <a className="font-medium text-primary underline" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`} target="_blank" rel="noopener noreferrer">
                See it on a map
              </a>{" "}
              (opens OpenStreetMap). Use the EXIF Remover before sharing.
            </Alert>
          ) : null}

          {Object.keys(tags).length === 0 ? <Alert tone="success">No metadata found. This image is clean.</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SUMMARY.map((s) => {
              const value = summaryValue(tags, s.label, s.keys);
              return value ? <ResultRow key={s.label} label={s.label} value={value} mono={false} /> : null;
            })}
          </div>

          {Object.keys(tags).length > 0 ? (
            <Panel title="All fields">
              <Input aria-label="Filter fields" placeholder="Filter fields…" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-sm" />
              <ScrollArea label="All metadata fields" className="max-h-[28rem] rounded-xl border border-border bg-card">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-border font-mono text-[13px]">
                    {entries.map(([k, v]) => (
                      <tr key={k}>
                        <th scope="row" className="w-1/3 px-4 py-2 align-top font-medium text-muted-foreground">
                          {k}
                        </th>
                        <td className="break-all px-4 py-2">{show(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
