/** Logic for the GraphQL Query Validator tool. Keep this file free of React, the DOM and the network. */

import { buildSchema, GraphQLError, parse, validate } from "graphql";

export interface GraphqlValidationIssue {
  message: string;
  line?: number;
  column?: number;
}

export interface GraphqlValidationResult {
  valid: boolean;
  errors: GraphqlValidationIssue[];
}

/**
 * Validate a GraphQL query against a schema.
 * If `schema` is empty, only the query syntax is checked.
 */
export function validateGraphqlQuery(query: string, schema = ""): GraphqlValidationResult {
  const trimmed = query.trim();
  if (trimmed === "") {
    return { valid: false, errors: [{ message: "Enter a GraphQL query or mutation to validate." }] };
  }

  let document: ReturnType<typeof parse>;
  try {
    document = parse(trimmed);
  } catch (error) {
    return { valid: false, errors: [graphqlErrorToIssue(error)] };
  }

  if (!schema.trim()) {
    return { valid: true, errors: [] };
  }

  let schemaObject: ReturnType<typeof buildSchema>;
  try {
    schemaObject = buildSchema(schema.trim(), { assumeValidSDL: false });
  } catch (error) {
    return { valid: false, errors: [graphqlErrorToIssue(error, "Schema error: ")] };
  }

  const validationErrors = validate(schemaObject, document);
  if (validationErrors.length === 0) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: validationErrors.map((err) => graphqlErrorToIssue(err)),
  };
}

function graphqlErrorToIssue(error: unknown, prefix = ""): GraphqlValidationIssue {
  if (error instanceof GraphQLError) {
    const location = error.locations?.[0];
    return {
      message: `${prefix}${error.message}`,
      line: location?.line,
      column: location?.column,
    };
  }

  if (error instanceof Error) {
    return { message: `${prefix}${error.message}` };
  }

  return { message: `${prefix}${String(error)}` };
}
