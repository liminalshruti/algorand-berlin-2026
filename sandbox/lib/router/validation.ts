// Shayaun's lane — Validation (router glue).
import type { PaymentResult, Provider } from './contract.js';

export interface ValidationResult {
  price_match: boolean;
  output_pass: boolean | null;
  response: number; // 0..100
}

/**
 * Validation Registry — router glue (ref/SPEC_shayaun + ERC8004_AVM_MAPPING §3).
 * Price-vs-quote is the objective, on-chain-verifiable MVP check: settled vs quoted.
 * Output check derives from provider.quality (null when the provider is unknown / skipped).
 * response (ERC-8004 0..100): 100 iff price matches and output passes; 0 on a price mismatch;
 * 60 partial when price matches but output is below threshold.
 */
export function validate(payment: PaymentResult, provider?: Provider): ValidationResult {
  const price_match = payment.settled <= payment.quoted + 1e-9;
  const output_pass = provider ? provider.quality >= 0.6 : null;
  const response = !price_match ? 0 : output_pass === false ? 60 : 100;
  return { price_match, output_pass, response };
}
