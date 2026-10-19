"use client";

import { useState } from "react";
import { Field, Input, baseName } from "@toolwright/ui";
import { addTextWatermark } from "@toolwright/core/pdf";
import { parseColor } from "@toolwright/core/color";
import { DownloadResult, JobError, PdfDrop, PdfSourceCard, RunButton, useJob, usePdfSource } from "../../shared/pdf-ui";
import { NumberField, num } from "../../shared/number-field";

export default function Tool() {
  const pdf = usePdfSource();
  const [text, setText] = useState("CONFIDENTIAL");
  const [size, setSize] = useState("72");
  const [opacity, setOpacity] = useState("20");
  const [angle, setAngle] = useState("45");
  const [color, setColor] = useState("#6b7280");
  const job = useJob<Uint8Array>();
  const source = pdf.source;

  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={() => (pdf.clear(), job.reset())} /> : <PdfDrop onFile={pdf.load} onReject={pdf.setError} loading={pdf.loading} />}
      <JobError error={pdf.error} />

      {source ? (
        <>
          <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Watermark text" className="lg:col-span-2">
              {(id) => <Input id={id} value={text} onChange={(e) => (setText(e.target.value), job.reset())} />}
            </Field>
            <NumberField label="Font size" suffix="pt" value={size} onChange={setSize} min={8} max={300} />
            <NumberField label="Opacity" suffix="%" value={opacity} onChange={setOpacity} min={1} max={100} />
            <NumberField label="Angle" suffix="°" value={angle} onChange={setAngle} min={-180} max={180} />
            <Field label="Color">
              {(id) => <input id={id} type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-full cursor-pointer rounded-lg border border-border bg-card p-1" />}
            </Field>
          </div>
          <RunButton
            busy={job.busy}
            onClick={() =>
              job.run(() => {
                const c = parseColor(color) ?? { r: 128, g: 128, b: 128, a: 1 };
                return addTextWatermark(source.bytes, {
                  text,
                  fontSize: num(size) || 72,
                  opacity: Math.min(1, Math.max(0.01, (num(opacity) || 20) / 100)),
                  angle: num(angle) || 0,
                  color: { r: c.r / 255, g: c.g / 255, b: c.b / 255 },
                });
              })
            }
          >
            Add watermark
          </RunButton>
        </>
      ) : null}

      <JobError error={job.error} />
      {job.result && source ? <DownloadResult data={job.result} filename={`${baseName(source.file.name)}-watermarked.pdf`} /> : null}
    </div>
  );
}
