"use client";

import { useState } from "react";
import { Button, Field, Input, Panel, ScrollArea, cn } from "@toolwright/ui";
import { octalToPermissions, permissionsToOctal, permissionsToSymbolic, symbolicToPermissions, type Permissions } from "@toolwright/core/reference";
import { ResultRow } from "../../shared/result-row";

type Who = keyof Permissions;
type Bit = "r" | "w" | "x";

const WHO: { key: Who; label: string }[] = [
  { key: "owner", label: "Owner" },
  { key: "group", label: "Group" },
  { key: "other", label: "Others" },
];
const BITS: { key: Bit; label: string }[] = [
  { key: "r", label: "Read" },
  { key: "w", label: "Write" },
  { key: "x", label: "Execute" },
];

const PRESETS = [
  { mode: "644", note: "Files: owner writes, everyone reads" },
  { mode: "755", note: "Scripts & directories" },
  { mode: "600", note: "Private files (SSH keys)" },
  { mode: "700", note: "Private directories" },
  { mode: "777", note: "Everyone can do everything" },
];

export default function Tool() {
  const [perms, setPerms] = useState<Permissions>(() => octalToPermissions("755"));
  const [octalText, setOctalText] = useState("755");
  const [symbolicText, setSymbolicText] = useState("rwxr-xr-x");
  const [error, setError] = useState<string | null>(null);

  const apply = (next: Permissions) => {
    setPerms(next);
    setOctalText(permissionsToOctal(next));
    setSymbolicText(permissionsToSymbolic(next));
    setError(null);
  };

  const octal = permissionsToOctal(perms);

  return (
    <div className="flex flex-col gap-5">
      <ScrollArea label="Permission checkboxes" className="rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium"> </th>
              {BITS.map((b) => (
                <th key={b.key} className="px-4 py-2.5 font-medium">{b.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {WHO.map((w) => (
              <tr key={w.key}>
                <th scope="row" className="px-4 py-3 text-left font-medium">{w.label}</th>
                {BITS.map((b) => (
                  <td key={b.key} className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${w.label} ${b.label.toLowerCase()}`}
                      className={cn("size-5 cursor-pointer accent-primary")}
                      checked={perms[w.key][b.key]}
                      onChange={(e) => apply({ ...perms, [w.key]: { ...perms[w.key], [b.key]: e.target.checked } })}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Octal">
          {(id) => (
            <Input
              id={id}
              mono
              value={octalText}
              maxLength={4}
              onChange={(e) => {
                setOctalText(e.target.value);
                try {
                  const next = octalToPermissions(e.target.value);
                  setPerms(next);
                  setSymbolicText(permissionsToSymbolic(next));
                  setError(null);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Invalid octal mode.");
                }
              }}
            />
          )}
        </Field>
        <Field label="Symbolic">
          {(id) => (
            <Input
              id={id}
              mono
              value={symbolicText}
              maxLength={10}
              onChange={(e) => {
                setSymbolicText(e.target.value);
                try {
                  const next = symbolicToPermissions(e.target.value);
                  setPerms(next);
                  setOctalText(permissionsToOctal(next));
                  setError(null);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Invalid symbolic mode.");
                }
              }}
            />
          )}
        </Field>
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <ResultRow label="Command" value={`chmod ${octal} filename`} />
        <ResultRow label="Recursive" value={`chmod -R ${octal} directory/`} />
      </div>

      <Panel title="Common modes">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.mode} variant="outline" size="sm" title={p.note} onClick={() => apply(octalToPermissions(p.mode))}>
              <span className="font-mono">{p.mode}</span>
              <span className="text-muted-foreground">{p.note}</span>
            </Button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
