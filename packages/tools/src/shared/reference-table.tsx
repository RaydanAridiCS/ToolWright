"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input, ScrollArea } from "@toolwright/ui";

export interface ReferenceColumn<T> {
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export interface ReferenceTableProps<T> {
  rows: readonly T[];
  columns: ReferenceColumn<T>[];
  /** Text a row is matched against when searching. */
  searchText: (row: T) => string;
  placeholder?: string;
  label: string;
  rowKey: (row: T) => string | number;
  toolbar?: ReactNode;
  /** Extra filter applied before search. */
  filter?: (row: T) => boolean;
}

/** Searchable table for reference data (status codes, MIME types, ports…). */
export function ReferenceTable<T>({ rows, columns, searchText, placeholder = "Search…", label, rowKey, toolbar, filter }: ReferenceTableProps<T>) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => (filter ? filter(row) : true) && (!q || searchText(row).toLowerCase().includes(q)));
  }, [rows, query, searchText, filter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={label} placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        {toolbar}
      </div>
      <ScrollArea label={`${label} results`} className="rounded-xl border border-border bg-card">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={c.header} scope="col" className="px-4 py-2.5 font-medium">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((row) => (
              <tr key={rowKey(row)} className="align-top">
                {columns.map((c) => (
                  <td key={c.header} className={c.className ?? "px-4 py-2.5"}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                  Nothing matches &ldquo;{query}&rdquo;.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </ScrollArea>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Showing {visible.length} of {rows.length}
      </p>
    </div>
  );
}
