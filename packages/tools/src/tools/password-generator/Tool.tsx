"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Alert, Button, CopyButton, Field, Input, Panel, SegmentedControl, Select, Toggle, cn } from "@toolwright/ui";
import { estimateStrength, generatePassphrase, generatePassword, WORDLIST_SIZE } from "@toolwright/core/password";
import { errorMessage } from "../../shared/format";

type Mode = "password" | "passphrase";

const METER = ["bg-danger", "bg-danger", "bg-warning", "bg-success", "bg-success"];

export default function Tool() {
  const [mode, setMode] = useState<Mode>("password");
  const [length, setLength] = useState(20);
  const [lower, setLower] = useState(true);
  const [upper, setUpper] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [ambiguous, setAmbiguous] = useState(false);
  const [words, setWords] = useState(6);
  const [separator, setSeparator] = useState("-");
  const [capitalize, setCapitalize] = useState(false);
  const [includeNumber, setIncludeNumber] = useState(false);
  const [count, setCount] = useState(1);
  const [values, setValues] = useState<string[]>([]);
  const [entropy, setEntropy] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(() => {
    try {
      const results = Array.from({ length: count }, () =>
        mode === "password"
          ? generatePassword({ length, lower, upper, digits, symbols, excludeAmbiguous: ambiguous })
          : generatePassphrase({ words, separator, capitalize, includeNumber }),
      );
      setValues(results.map((r) => r.password));
      setEntropy(results[0]?.entropyBits ?? 0);
      setError(null);
    } catch (err) {
      setValues([]);
      setError(errorMessage(err));
    }
  }, [mode, length, lower, upper, digits, symbols, ambiguous, words, separator, capitalize, includeNumber, count]);

  // Generate on mount (client only, so server and client HTML match) and whenever options change.
  useEffect(() => generate(), [generate]);

  const first = values[0] ?? "";
  const strength = estimateStrength(first);
  const score = mode === "passphrase" ? (entropy < 40 ? 1 : entropy < 55 ? 2 : entropy < 75 ? 3 : 4) : strength.score;
  const label = ["Very weak", "Weak", "Fair", "Strong", "Very strong"][score] ?? "";

  return (
    <div className="flex flex-col gap-5">
      <SegmentedControl
        label="Type"
        value={mode}
        onValueChange={setMode}
        options={[
          { value: "password", label: "Random password" },
          { value: "passphrase", label: "Passphrase" },
        ]}
      />

      <Panel
        title="Your new secret"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={generate}>
              <RefreshCw /> Regenerate
            </Button>
            <CopyButton text={values.join("\n")} label={values.length > 1 ? "Copy all" : "Copy"} />
          </>
        }
      >
        <div className="flex flex-col gap-2">
          {values.map((v, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3">
              <code className="min-w-0 flex-1 break-all font-mono text-lg" data-testid="generated">
                {v}
              </code>
              {values.length > 1 ? <CopyButton text={v} size="sm" variant="ghost" /> : null}
            </div>
          ))}
        </div>
        {first ? (
          <div className="mt-1" aria-live="polite">
            <div className="flex h-1.5 gap-1" role="img" aria-label={`Strength: ${label}`}>
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={cn("flex-1 bg-border", i <= score && METER[score])} />
              ))}
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              <strong className="text-foreground">{label}</strong> · {Math.round(entropy)} bits of entropy
              {mode === "password" ? <> · estimated time to crack at 10 billion guesses/s: {strength.crackTime}</> : null}
            </p>
          </div>
        ) : null}
      </Panel>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {mode === "password" ? (
        <div className="grid gap-5 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
          <Field label={`Length: ${length}`} className="sm:col-span-2">
            {(id) => <input id={id} type="range" min={4} max={128} value={length} onChange={(e) => setLength(Number(e.target.value))} className="w-full accent-primary" />}
          </Field>
          <Toggle label="Lowercase (a–z)" checked={lower} onCheckedChange={setLower} />
          <Toggle label="Uppercase (A–Z)" checked={upper} onCheckedChange={setUpper} />
          <Toggle label="Numbers (0–9)" checked={digits} onCheckedChange={setDigits} />
          <Toggle label="Symbols (!@#…)" checked={symbols} onCheckedChange={setSymbols} />
          <Toggle label="Avoid look-alike characters (O 0 l 1 I)" checked={ambiguous} onCheckedChange={setAmbiguous} />
          <Field label="How many">
            {(id) => (
              <Select id={id} value={String(count)} onChange={(e) => setCount(Number(e.target.value))}>
                {[1, 5, 10, 20].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      ) : (
        <div className="grid gap-5 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
          <Field label={`Words: ${words}`} hint={`Chosen from a list of ${WORDLIST_SIZE.toLocaleString()} words (11 bits each).`} className="sm:col-span-2">
            {(id) => <input id={id} type="range" min={3} max={12} value={words} onChange={(e) => setWords(Number(e.target.value))} className="w-full accent-primary" />}
          </Field>
          <Field label="Separator">
            {(id) => <Input id={id} value={separator} maxLength={3} onChange={(e) => setSeparator(e.target.value)} />}
          </Field>
          <Field label="How many">
            {(id) => (
              <Select id={id} value={String(count)} onChange={(e) => setCount(Number(e.target.value))}>
                {[1, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Toggle label="Capitalize words" checked={capitalize} onCheckedChange={setCapitalize} />
          <Toggle label="Add a number" checked={includeNumber} onCheckedChange={setIncludeNumber} />
        </div>
      )}
    </div>
  );
}
