"use client";

import { useMemo } from "react";
import { Alert, Button, Field, Textarea, useShareableState } from "@toolwright/ui";
import { tomlToJson, validateToml } from "@toolwright/core/toml-validator";

const SAMPLE_TOML = `[package]
name = "toolwright"
version = "0.1.0"

[dependencies]
react = "^19.0.0"

[[authors]]
name = "Raydan"
role = "maintainer"`;

export default function Tool() {
  const { state, setState } = useShareableState({ toml: "" });

  const result = useMemo(() => {
    if (!state.toml.trim()) return null;
    return validateToml(state.toml);
  }, [state.toml]);

  const json = useMemo(() => {
    if (!result?.valid) return "";
    try {
      return tomlToJson(state.toml, { indent: 2 });
    } catch {
      return "";
    }
  }, [result, state.toml]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="TOML">
          {(id) => (
            <Textarea
              id={id}
              value={state.toml}
              onChange={(e) => setState((s) => ({ ...s, toml: e.target.value }))}
              placeholder="Paste a TOML document here."
              rows={14}
            />
          )}
        </Field>

        <Field label="JSON">
          {(id) => (
            <Textarea
              id={id}
              value={json}
              readOnly
              placeholder={result?.valid ? "" : "Valid TOML will appear here as JSON."}
              rows={14}
            />
          )}
        </Field>
      </div>

      {result ? (
        result.valid ? (
          <Alert tone="success">Valid TOML. The JSON conversion is shown on the right.</Alert>
        ) : (
          <Alert tone="error" title="Invalid TOML">
            {result.error?.line ? `Line ${result.error.line}${result.error.column ? `, column ${result.error.column}` : ""}: ` : null}
            {result.error?.message}
          </Alert>
        )
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="md" onClick={() => setState((s) => ({ ...s, toml: SAMPLE_TOML }))}>
          Sample
        </Button>
        <Button variant="ghost" size="md" onClick={() => setState((s) => ({ ...s, toml: "" }))}>
          Clear
        </Button>
      </div>
    </div>
  );
}
