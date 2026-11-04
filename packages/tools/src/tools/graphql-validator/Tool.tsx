"use client";

import { useMemo } from "react";
import { Alert, Badge, Field, Textarea, useShareableState } from "@toolwright/ui";
import { validateGraphqlQuery } from "@toolwright/core/graphql-validator";

const SAMPLE_QUERY = `query GetUser($id: ID!) {
  user(id: $id) {
    name
    email
  }
}`;

const SAMPLE_SCHEMA = `type Query {
  user(id: ID!): User
}

type User {
  id: ID!
  name: String!
  email: String
}`;

export default function Tool() {
  const { state, setState } = useShareableState({ query: "", schema: "" });

  const result = useMemo(() => {
    if (!state.query.trim()) return null;
    return validateGraphqlQuery(state.query, state.schema);
  }, [state.query, state.schema]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="GraphQL query">
          {(id) => (
            <Textarea
              id={id}
              value={state.query}
              onChange={(e) => setState((s) => ({ ...s, query: e.target.value }))}
              placeholder="Paste a GraphQL query or mutation."
              rows={12}
            />
          )}
        </Field>

        <Field label="Schema (optional)">
          {(id) => (
            <Textarea
              id={id}
              value={state.schema}
              onChange={(e) => setState((s) => ({ ...s, schema: e.target.value }))}
              placeholder="Paste a GraphQL schema (SDL) to validate the query against it."
              rows={12}
            />
          )}
        </Field>
      </div>

      {result ? (
        result.valid ? (
          <Alert tone="success">
            <Badge tone="success">Valid</Badge> The query is syntactically correct
            {state.schema.trim() ? " and matches the schema." : "."}
          </Alert>
        ) : (
          <Alert tone="error" title="Validation failed">
            <ul className="list-disc space-y-1 pl-4">
              {result.errors.map((err, i) => (
                <li key={i}>
                  {err.line ? `Line ${err.line}${err.column ? `, column ${err.column}` : ""}: ` : null}
                  {err.message}
                </li>
              ))}
            </ul>
          </Alert>
        )
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="text-sm font-semibold text-primary hover:underline"
          onClick={() => setState({ query: SAMPLE_QUERY, schema: SAMPLE_SCHEMA })}
        >
          Load sample
        </button>
        <button
          type="button"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => setState({ query: "", schema: "" })}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
