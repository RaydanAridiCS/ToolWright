"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, CopyButton, Field, Input, Panel, Select, Textarea } from "@toolwright/ui";
import {
  DEFAULT_JWT_HEADER,
  createDefaultPayload,
  generateJwt,
  updateTimeClaims,
  type GeneratedJwt,
  type JwtAlgorithm,
} from "@toolwright/core/jwt-generator";
import { errorMessage } from "../../shared/format";

export default function Tool() {
  // Tokens and secrets are credentials: keep them out of the URL (no shareable state).
  const [algorithm, setAlgorithm] = useState<JwtAlgorithm>("HS256");
  const [secret, setSecret] = useState("your-256-bit-secret");
  const [isSecretBase64, setIsSecretBase64] = useState(false);
  const [header, setHeader] = useState(DEFAULT_JWT_HEADER);
  const [payload, setPayload] = useState(() => createDefaultPayload());
  const [customHeaderOpen, setCustomHeaderOpen] = useState(false);

  const [result, setResult] = useState<GeneratedJwt | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-generate whenever inputs change
  useEffect(() => {
    let live = true;
    generateJwt({
      algorithm,
      secret: algorithm === "none" ? undefined : secret,
      isSecretBase64,
      header,
      payload,
    })
      .then((res) => {
        if (!live) return;
        setResult(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setResult(null);
        setError(errorMessage(err, "Failed to generate JWT."));
      });

    return () => {
      live = false;
    };
  }, [algorithm, secret, isSecretBase64, header, payload]);

  const generateRandomSecret = () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    setSecret(hex);
    setIsSecretBase64(false);
  };

  const handleUpdateTimes = (expSeconds?: number) => {
    setPayload((curr) => updateTimeClaims(curr, { addIat: true, expSeconds }));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left Column: Configuration & Payload */}
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
            <Field label="Algorithm">
              {(id) => (
                <Select
                  id={id}
                  value={algorithm}
                  onChange={(e) => {
                    const nextAlg = e.target.value as JwtAlgorithm;
                    setAlgorithm(nextAlg);
                    try {
                      const h = JSON.parse(header) as Record<string, unknown>;
                      h.alg = nextAlg;
                      setHeader(JSON.stringify(h, null, 2));
                    } catch {
                      // leave as is
                    }
                  }}
                >
                  <option value="HS256">HS256 (HMAC SHA-256)</option>
                  <option value="HS384">HS384 (HMAC SHA-384)</option>
                  <option value="HS512">HS512 (HMAC SHA-512)</option>
                  <option value="none">none (Unsecured token)</option>
                </Select>
              )}
            </Field>

            {algorithm !== "none" ? (
              <Field
                label="Secret key"
                hint={
                  <span className="flex items-center justify-between">
                    <span>Stored only in this tab</span>
                    <button
                      type="button"
                      onClick={generateRandomSecret}
                      className="text-xs text-foreground underline hover:no-underline"
                    >
                      Random
                    </button>
                  </span>
                }
              >
                {(id) => (
                  <div className="flex flex-col gap-1.5">
                    <Input
                      id={id}
                      mono
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      placeholder="Enter HMAC secret key"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSecretBase64}
                        onChange={(e) => setIsSecretBase64(e.target.checked)}
                        className="rounded border-border"
                      />
                      Secret is Base64 encoded
                    </label>
                  </div>
                )}
              </Field>
            ) : null}
          </div>

          <Panel
            title="Payload (Claims)"
            actions={
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" onClick={() => handleUpdateTimes(3600)}>
                  +1 hr exp
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleUpdateTimes(86400)}>
                  +24 hr exp
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPayload(createDefaultPayload())}>
                  Reset
                </Button>
              </div>
            }
          >
            <Textarea
              aria-label="Payload JSON"
              rows={12}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              placeholder="Paste or write payload JSON"
            />
          </Panel>

          <details
            open={customHeaderOpen}
            onToggle={(e) => setCustomHeaderOpen(e.currentTarget.open)}
            className="rounded-xl border border-border bg-card p-3 text-sm"
          >
            <summary className="cursor-pointer font-semibold text-muted-foreground hover:text-foreground">
              Advanced: Custom Header
            </summary>
            <div className="mt-3">
              <Textarea
                aria-label="Header JSON"
                rows={5}
                value={header}
                onChange={(e) => setHeader(e.target.value)}
              />
            </div>
          </details>
        </div>

        {/* Right Column: Encoded Token & Output */}
        <div className="flex flex-col gap-4">
          <Panel
            title="Signed token"
            actions={
              result ? (
                <div className="flex items-center gap-1.5">
                  <CopyButton text={result.token} label="Copy JWT" variant="primary" />
                  <CopyButton
                    text={`Authorization: Bearer ${result.token}`}
                    label="Copy cURL Header"
                    variant="outline"
                  />
                </div>
              ) : null
            }
          >
            {error ? (
              <Alert tone="error">{error}</Alert>
            ) : result ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={result.algorithm === "none" ? "accent" : "success"}>
                    {result.algorithm === "none" ? "Unsecured (none)" : `Signed: ${result.algorithm}`}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">
                    {result.token.length} chars
                  </span>
                </div>

                <div className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs break-all leading-relaxed select-all">
                  <span className="font-semibold text-foreground">{result.headerBase64}</span>
                  <span className="text-muted-foreground font-bold">.</span>
                  <span className="font-semibold text-foreground/80">{result.payloadBase64}</span>
                  <span className="text-muted-foreground font-bold">.</span>
                  <span className="font-semibold text-muted-foreground">{result.signatureBase64}</span>
                </div>

                <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-xs">
                  <div className="flex items-center justify-between border-b border-border pb-1.5">
                    <span className="text-muted-foreground">Header</span>
                    <span className="font-mono">{result.headerBase64.length} chars</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-1.5">
                    <span className="text-muted-foreground">Payload</span>
                    <span className="font-mono">{result.payloadBase64.length} chars</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Signature</span>
                    <span className="font-mono">
                      {result.signatureBase64 ? `${result.signatureBase64.length} chars` : "none"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-1">
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                  <a
                    href="/tools/jwt-decoder"
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1"
                  >
                    Open in JWT Decoder →
                  </a>
                </div>
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}
