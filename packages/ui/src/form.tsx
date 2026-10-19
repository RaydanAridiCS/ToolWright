import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "./cn";

// Form controls are "sheet" colored with a visible ink border (≥3:1 against the page, WCAG 1.4.11).
const control =
  "w-full rounded-md border border-foreground/55 bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground " +
  "transition-colors hover:border-foreground focus-visible:border-foreground " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[13px] font-semibold text-foreground", className)} {...props} />;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ className, mono, ...props }: InputProps) {
  return <input className={cn(control, "h-10", mono && "font-mono text-[13px]", className)} {...props} />;
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, mono = true, spellCheck = false, ...props }: TextareaProps) {
  return (
    <textarea
      spellCheck={spellCheck}
      className={cn(control, "min-h-32 resize-y py-2.5 leading-relaxed", mono && "font-mono text-[13px]", className)}
      {...props}
    />
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  ref?: Ref<HTMLSelectElement>;
}

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select className={cn(control, "h-10 cursor-pointer appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-9 select-chevron", className)} {...props}>
      {children}
    </select>
  );
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  /** Render function receives the generated id so the label is associated with the control. */
  children: (id: string) => ReactNode;
}

/** A labelled form control. */
export function Field({ label, hint, className, children }: FieldProps) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  hint?: ReactNode;
}

/** An accessible switch built on a native checkbox: a square track with a square thumb. */
export function Toggle({ label, checked, onCheckedChange, hint, className, id, ...props }: ToggleProps) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input
        id={inputId}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-sm border border-foreground/60 bg-muted transition-colors",
          "checked:border-foreground checked:bg-primary disabled:cursor-not-allowed disabled:opacity-50",
          "after:absolute after:left-[3px] after:top-[3px] after:size-3 after:rounded-[1px] after:bg-foreground after:transition-transform after:content-['']",
          "checked:after:translate-x-4 checked:after:bg-primary-foreground",
        )}
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={inputId} className="cursor-pointer text-sm leading-5 text-foreground">
          {label}
        </label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  label: string;
  className?: string;
}

/** A radio group styled as ledger tabs: the active choice is highlighted with the marker. */
export function SegmentedControl<T extends string>({ value, onValueChange, options, label, className }: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex flex-wrap gap-1", className)}>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "cursor-pointer border px-3 py-1.5 text-[13px] font-semibold transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
            value === option.value
              ? "border-foreground bg-marker text-marker-foreground"
              : "border-transparent text-muted-foreground hover:border-foreground/40 hover:text-foreground",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onValueChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
