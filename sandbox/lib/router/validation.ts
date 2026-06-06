// Shayaun's lane — owns this file.
import type { PaymentResult, Verdict } from './contract.js';

export async function validate(
  _payment: PaymentResult,
  _provider_id: string,
): Promise<Verdict> {
  throw new Error('Not implemented');
}
