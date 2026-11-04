import { describe, expect, it } from "vitest";
import { validateGraphqlQuery } from "../src/graphql-validator";

const SAMPLE_SCHEMA = `
  type Query {
    user(id: ID!): User
    users: [User!]!
  }

  type User {
    id: ID!
    name: String!
    email: String
  }
`;

describe("validateGraphqlQuery", () => {
  it("returns valid for an empty schema and a syntactically correct query", () => {
    const result = validateGraphqlQuery("{ hello }");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects empty input", () => {
    const result = validateGraphqlQuery("");
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/enter a graphql/i);
  });

  it("reports a syntax error with line and column", () => {
    const result = validateGraphqlQuery("{ hello(");
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.line).toBeGreaterThanOrEqual(1);
    expect(result.errors[0]?.message).toBeTruthy();
  });

  it("validates a query against a schema", () => {
    const result = validateGraphqlQuery("{ user(id: \"1\") { name email } }", SAMPLE_SCHEMA);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("reports a field that does not exist on the schema", () => {
    const result = validateGraphqlQuery("{ user(id: \"1\") { name phone } }", SAMPLE_SCHEMA);
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/phone|Cannot query field/i);
  });

  it("reports a missing required argument", () => {
    const result = validateGraphqlQuery("{ user { name } }", SAMPLE_SCHEMA);
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/required|argument/i);
  });

  it("reports an invalid schema", () => {
    const result = validateGraphqlQuery("{ hello }", "type Query {");
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/schema error/i);
  });

  it("reports multiple validation errors at once", () => {
    const result = validateGraphqlQuery("{ user { phone nickname } }", SAMPLE_SCHEMA);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
