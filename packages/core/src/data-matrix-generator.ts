/** Logic for the Data Matrix Generator tool. Keep this file free of React, the DOM and the network. */

export const DATA_MATRIX_MAX_LENGTH = 3116;

export interface DataMatrixOptions {
  text: string;
}

export interface DataMatrixValidationResult {
  valid: boolean;
  error?: string;
}

/** Validate text before handing it to the barcode renderer. */
export function validateDataMatrixInput(input: string): DataMatrixValidationResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { valid: false, error: "Enter the text or data to encode." };
  }
  if (trimmed.length > DATA_MATRIX_MAX_LENGTH) {
    return { valid: false, error: `Data Matrix can hold up to ${DATA_MATRIX_MAX_LENGTH} characters; yours has ${trimmed.length}.` };
  }
  return { valid: true };
}
