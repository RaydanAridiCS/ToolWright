"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Field, Input, Panel, Textarea, useDebounced } from "@toolwright/ui";
import { decodeJwt, verifyJwtHmac } from "@toolwright/core/jwt";
import { CopyButton } from "@toolwright/ui";
import { errorMessage } from "../../shared/format";

// Example token signed with the secret "your-256-bit-secret".
const SAMPLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

export default function Tool() {
  // Tokens are credentials: keep them out of the URL (no shareable state).
  const [rawToken, setRawToken] = useState("");
  const [secret, setSecret] = useState("");
  const token = useDebounced(rawToken, 150);
  const [verified, setVerified] = useState<null | boolean | string>(null);

  const decoded = useMemo(() => {
    if (!token.trim()) return null;
    try {
      return { ok: true as const, value: decodeJwt(token) };
    } catch (err) {
      return { ok: false as const, error: errorMessage(err) };
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    if (!secret || !decoded?.ok) {
      setVerified(null);
      return;
    }
    verifyJwtHmac(token, secret)
      .then((ok) => !cancelled && setVerified(ok))
      .catch((err: unknown) => !cancelled && setVerified(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [secret, token, decoded]);

  return (
    <div className="flex flex-col gap-5">
      <Panel
        title="Encoded token"
        actions={
          <Button size="sm" variant="ghost" onClick={() => setRawToken(SAMPLE)}>
            Sample
          </Button>
        }
      >
        <Textarea aria-label="Encoded token" rows={5} value={rawToken} onChange={(e) => setRawToken(e.target.value)} placeholder="Paste a JWT: xxxxx.yyyyy.zzzzz" className="break-all" />
      </Panel>

      {decoded && !decoded.ok ? <Alert tone="error">{decoded.error}</Alert> : null}

      {decoded?.ok ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {decoded.value.expired === true ? <Badge tone="danger">Expired</Badge> : null}
            {decoded.value.expired === false ? <Badge tone="success">Not expired</Badge> : null}
            {decoded.value.expired === null ? <Badge>No expiry claim</Badge> : null}
            {decoded.value.notYetValid ? <Badge tone="danger">Not valid yet</Badge> : null}
            <Badge tone="primary">alg: {String(decoded.value.header.alg ?? "unknown")}</Badge>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Header" actions={<CopyButton text={JSON.stringify(decoded.value.header, null, 2)} />}>
              <Textarea aria-label="Decoded header" readOnly rows={8} value={JSON.stringify(decoded.value.header, null, 2)} className="bg-muted/40" />
            </Panel>
            <Panel title="Payload" actions={<CopyButton text={JSON.stringify(decoded.value.payload, null, 2)} />}>
              <Textarea aria-label="Decoded payload" readOnly rows={8} value={JSON.stringify(decoded.value.payload, null, 2)} className="bg-muted/40" />
            </Panel>
          </div>

          {decoded.value.times.exp || decoded.value.times.iat || decoded.value.times.nbf ? (
            <dl className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-3">
              {(
                [
                  ["Issued at (iat)", decoded.value.times.iat],
                  ["Not before (nbf)", decoded.value.times.nbf],
                  ["Expires (exp)", decoded.value.times.exp],
                ] as const
              )
                .filter(([, v]) => v)
                .map(([label, v]) => (
                  <div key={label}>
                    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                    <dd className="font-mono">{v}</dd>
                    <dd className="text-xs text-muted-foreground">{new Date(v as string).toLocaleString()} (your time)</dd>
                  </div>
                ))}
            </dl>
          ) : null}

          <Panel title="Verify signature (HS256 / HS384 / HS512)">
            <Field label="Shared secret" hint="Only HMAC tokens can be verified. The secret stays in this page.">
              {(id) => <Input id={id} type="password" mono autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="your-256-bit-secret" />}
            </Field>
            {verified === true ? <Alert tone="success" title="Signature is valid." /> : null}
            {verified === false ? <Alert tone="error" title="Signature does not match." >Either the secret is wrong or the token was modified.</Alert> : null}
            {typeof verified === "string" ? <Alert tone="warning">{verified}</Alert> : null}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
