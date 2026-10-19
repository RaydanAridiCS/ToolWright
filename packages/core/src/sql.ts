/** SQL formatting and minifying. */

import { format, type SqlLanguage } from "sql-formatter";

export type { SqlLanguage };

export const SQL_DIALECTS: { value: SqlLanguage; label: string }[] = [
  { value: "sql", label: "Standard SQL" },
  { value: "postgresql", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "mariadb", label: "MariaDB" },
  { value: "sqlite", label: "SQLite" },
  { value: "transactsql", label: "SQL Server (T-SQL)" },
  { value: "plsql", label: "Oracle (PL/SQL)" },
  { value: "bigquery", label: "BigQuery" },
  { value: "snowflake", label: "Snowflake" },
];

export interface FormatSqlOptions {
  language?: SqlLanguage;
  tabWidth?: number;
  useTabs?: boolean;
  keywordCase?: "upper" | "lower" | "preserve";
}

export function formatSql(sql: string, options: FormatSqlOptions = {}): string {
  return format(sql, {
    language: options.language ?? "sql",
    tabWidth: options.tabWidth ?? 2,
    useTabs: options.useTabs ?? false,
    keywordCase: options.keywordCase ?? "upper",
    linesBetweenQueries: 1,
  });
}

/** Strip comments and collapse whitespace while leaving string literals and quoted identifiers intact. */
export function minifySql(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  // Quoted segments are swapped for placeholders so the whitespace cleanup below cannot touch them.
  const literals: string[] = [];
  while (i < n) {
    const ch = sql[i] as string;
    const next = sql[i + 1];
    if (ch === "'" || ch === '"' || ch === "`") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) j += 2;
          else break;
        } else j++;
      }
      out += `\uE000${literals.push(sql.slice(i, j + 1)) - 1}\uE000`;
      i = j + 1;
    } else if (ch === "-" && next === "-") {
      while (i < n && sql[i] !== "\n") i++;
    } else if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      out += " ";
    } else if (/\s/.test(ch)) {
      while (i < n && /\s/.test(sql[i] as string)) i++;
      out += " ";
    } else {
      out += ch;
      i++;
    }
  }
  return out
    .replace(/\s*([,();=<>])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\uE000(\d+)\uE000/g, (_, index: string) => literals[Number(index)] as string);
}
