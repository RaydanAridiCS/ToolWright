"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, FileUp, UploadCloud, X } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { cn } from "./cn";
import { copyText, downloadBlob, formatFileSize, matchesAccept } from "./files";

export interface CopyButtonProps extends Omit<ButtonProps, "onClick" | "children"> {
  text: string;
  label?: string;
  copiedLabel?: string;
}

export function CopyButton({ text, label = "Copy", copiedLabel = "Copied", variant = "outline", size = "sm", disabled, ...props }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = async () => {
    if (await copyText(text)) {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <Button variant={variant} size={size} disabled={disabled || !text} onClick={onClick} {...props}>
      {copied ? <Check className="text-success" /> : <Copy />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </Button>
  );
}

export interface DownloadButtonProps extends Omit<ButtonProps, "onClick" | "children"> {
  data: string | Uint8Array | Blob;
  filename: string;
  mime?: string;
  label?: string;
}

export function DownloadButton({ data, filename, mime, label = "Download", variant = "outline", size = "sm", disabled, ...props }: DownloadButtonProps) {
  const empty = typeof data === "string" ? data === "" : data instanceof Blob ? data.size === 0 : data.length === 0;
  return (
    <Button variant={variant} size={size} disabled={disabled || empty} onClick={() => downloadBlob(data, filename, mime)} {...props}>
      <Download />
      {label}
    </Button>
  );
}

export interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  /** Same format as the `accept` attribute: `.pdf`, `image/*`, … */
  accept?: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
  /** Reject files larger than this many megabytes. */
  maxSizeMB?: number;
  className?: string;
  disabled?: boolean;
  onReject?: (message: string) => void;
}

export function FileDropzone({
  onFiles,
  accept,
  multiple = false,
  label = "Drop a file here, or click to browse",
  hint,
  maxSizeMB = 200,
  className,
  disabled,
  onReject,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handle = useCallback(
    (list: FileList | File[] | null) => {
      if (!list || list.length === 0) return;
      const accepted: File[] = [];
      const rejected: string[] = [];
      for (const file of Array.from(list)) {
        if (!matchesAccept(file, accept)) rejected.push(`${file.name} is not a supported file type.`);
        else if (file.size > maxSizeMB * 1024 * 1024) rejected.push(`${file.name} is larger than ${maxSizeMB} MB (${formatFileSize(file.size)}).`);
        else accepted.push(file);
      }
      if (rejected.length) onReject?.(rejected.join(" "));
      if (accepted.length) onFiles(multiple ? accepted : accepted.slice(0, 1));
    },
    [accept, maxSizeMB, multiple, onFiles, onReject],
  );

  return (
    <div
      className={cn(
        "relative flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 px-4 py-8 text-center transition-colors",
        "hover:border-primary/60 hover:bg-primary/5 focus-within:border-primary",
        dragging && "border-primary bg-primary/10",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handle(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <UploadCloud aria-hidden className="size-8 text-primary" />
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{hint ?? "Files never leave your device."}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-label={label}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = ""; // allow re-selecting the same file
        }}
      />
    </div>
  );
}

export interface FileListItemProps {
  name: string;
  size?: number;
  detail?: string;
  onRemove?: () => void;
  children?: React.ReactNode;
}

export function FileListItem({ name, size, detail, onRemove, children }: FileListItemProps) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <FileUp aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground" title={name}>
          {name}
        </p>
        {size !== undefined || detail ? <p className="text-xs text-muted-foreground">{[size !== undefined ? formatFileSize(size) : null, detail].filter(Boolean).join(" · ")}</p> : null}
      </div>
      {children}
      {onRemove ? (
        <Button variant="ghost" size="icon" aria-label={`Remove ${name}`} onClick={onRemove} className="size-8">
          <X />
        </Button>
      ) : null}
    </li>
  );
}
