// Shayaun's lane — quote-vs-payment validation (router glue).
import type { PaymentResult } from './contract.js';

export interface ValidationResult {
  price_match: boolean;
  output_pass: boolean | null;
  response: number; // 0..100
  tag?: string;
}

/**
 * Validation Registry — router glue.
 * The demo check is objective quote drift: settled amount must not exceed the
 * route-time quote. Output/content validation is out of the active happy path.
 */
export function validate(payment: PaymentResult): ValidationResult {
  const price_match = payment.settled <= payment.quoted + 1e-9;
  const response = price_match ? 100 : 0;
  return { price_match, output_pass: null, response };
}
