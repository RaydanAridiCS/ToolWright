"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Alert, Button, Field, Input, Panel, useShareableState, downloadBlob } from "@toolwright/ui";
import { validatePdf417Input } from "@toolwright/core/pdf417-generator";
import { generate2dBarcode } from "../../shared/barcode-2d";

export default function Tool() {
  const { state, setState } = useShareableState({ text: "" });
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validation = useMemo(() => validatePdf417Input(state.text), [state.text]);

  const handleGenerate = async () => {
    if (!validation.valid) return;
    setBusy(true);
    setError(null);
    try {
      const result = await generate2dBarcode({ text: state.text.trim(), type: "pdf417", scale: 3 });
      setSvg(result.svg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the barcode.");
      setSvg(null);
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = () => {
    if (!svg) return;
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "pdf417.svg");
  };

  return (
    <div className="flex flex-col gap-5">
      <Field label="Text to encode">
        {(id) => <Input id={id} value={state.text} onChange={(e) => setState((s) => ({ ...s, text: e.target.value }))} placeholder="Enter text, a tracking number, a URL..." />}
      </Field>

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" size="md" disabled={!validation.valid || busy} onClick={handleGenerate}>
          {busy ? "Generating…" : "Generate"}
        </Button>
        <Button variant="outline" size="md" disabled={!svg} onClick={handleDownload}>
          <Download aria-hidden /> SVG
        </Button>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {!validation.valid && state.text ? <Alert tone="warning">{validation.error}</Alert> : null}

      {svg ? (
        <Panel title="PDF417">
          <div
            className="inline-block rounded-md border border-border bg-white p-4"
            dangerouslySetInnerHTML={{ __html: svg }}
            aria-label={`PDF417 barcode for ${state.text}`}
          />
        </Panel>
      ) : null}
    </div>
  );
}
