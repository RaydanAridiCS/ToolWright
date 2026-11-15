"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, Field, Input } from "@toolwright/ui";

/**
 * A labelled password input with a show/hide button. The value lives in React state only: never in the URL
 * hash, storage or a request.
 */
export function PasswordField({
  label,
  value,
  onChange,
  hint,
  autoComplete = "off",
  onEnter,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  autoComplete?: "off" | "new-password" | "current-password";
  onEnter?: () => void;
  invalid?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <div className="flex gap-2">
          <Input
            id={id}
            type={shown ? "text" : "password"}
            value={value}
            autoComplete={autoComplete}
            spellCheck={false}
            aria-invalid={invalid ? true : undefined}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && onEnter) onEnter();
            }}
            className="min-w-0 flex-1"
          />
          <Button variant="outline" size="icon" className="size-10" aria-label={`Show ${label}`} aria-pressed={shown} onClick={() => setShown((s) => !s)}>
            {shown ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      )}
    </Field>
  );
}
