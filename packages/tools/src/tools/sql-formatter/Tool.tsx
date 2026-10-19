"use client";

import { TransformTool } from "@toolwright/ui";
import { formatSql, minifySql, SQL_DIALECTS, type SqlLanguage } from "@toolwright/core/sql";

export default function Tool() {
  return (
    <TransformTool
      acceptFile=".sql,.txt"
      inputLabel="SQL"
      outputLabel="Formatted SQL"
      outputFilename="query.sql"
      sample={"select u.id,u.name,count(o.id) as orders from users u left join orders o on o.user_id=u.id where u.active = true and o.created_at > '2026-01-01' group by u.id,u.name having count(o.id)>2 order by orders desc limit 10;"}
      rows={14}
      options={[
        { type: "select", key: "action", label: "Action", default: "format", options: [{ value: "format", label: "Format" }, { value: "minify", label: "Minify" }] },
        { type: "select", key: "language", label: "Dialect", default: "sql", options: SQL_DIALECTS.map((d) => ({ value: d.value, label: d.label })) },
        { type: "select", key: "keywordCase", label: "Keywords", default: "upper", options: [{ value: "upper", label: "UPPER CASE" }, { value: "lower", label: "lower case" }, { value: "preserve", label: "Keep as typed" }] },
        { type: "select", key: "indent", label: "Indent", default: "2", options: [{ value: "2", label: "2 spaces" }, { value: "4", label: "4 spaces" }, { value: "tab", label: "Tab" }] },
      ]}
      transform={(input, o) => {
        if (o.action === "minify") return minifySql(input);
        try {
          return formatSql(input, {
            language: o.language as SqlLanguage,
            keywordCase: o.keywordCase as "upper" | "lower" | "preserve",
            tabWidth: o.indent === "tab" ? 2 : Number(o.indent),
            useTabs: o.indent === "tab",
          });
        } catch (err) {
          throw new Error(`Could not parse this SQL: ${err instanceof Error ? err.message.split("\n")[0] : "unknown error"}`);
        }
      }}
    />
  );
}
