/** Logic for the PDF417 Generator tool. Keep this file free of React, the DOM and the network. */

export const PDF417_MAX_LENGTH = 1850;

export interface Pdf417Options {
  text: string;
}

export interface Pdf417ValidationResult {
  valid: boolean;
  error?: string;
}

/** Validate text before handing it to the barcode renderer. */
export function validatePdf417Input(input: string): Pdf417ValidationResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { valid: false, error: "Enter the text or data to encode." };
  }
  if (trimmed.length > PDF417_MAX_LENGTH) {
    return { valid: false, error: `PDF417 can hold up to ${PDF417_MAX_LENGTH} characters; yours has ${trimmed.length}.` };
  }
  return { valid: true };
}
