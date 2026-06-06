// Shayaun's lane — Reputation state (router glue).
import type { RepState } from './contract.js';
import type { ValidationResult } from './validation.js';

export interface RepFull {
  score: number | null;
  reads_logged: number;
  corrections_logged: number;
  by_tag: Record<string, number>;
}

export interface RouterRepState extends RepState {
  writeBack(provider_id: string, v: ValidationResult): RepFull;
  full(provider_id: string): RepFull | null;
}

/**
 * In-memory Reputation Registry (ref/SPEC_shayaun). Reputation is *earned*:
 *   score = round(100 * (landed - corrected) / landed); null when there's no history.
 * Reza's ranking / the /api/route handler read getReputation, so a write-back here
 * reroutes the next request (caught once → routed around). On a failed verdict we tag
 * the correction with the 9-tag taxonomy (`missed_compensation` for a hidden fee).
 *
 * Production seam: also mirror each write to the on-chain ReputationRegistry via the
 * generated client (giveFeedback with x402 paymentTxid + nonce) once app-ids are set.
 */
export function createRepState(): RouterRepState {
  const m = new Map<string, { reads: number; corrections: number; by_tag: Record<string, number> }>();
  const ensure = (id: string) => {
    let e = m.get(id);
    if (!e) { e = { reads: 0, corrections: 0, by_tag: {} }; m.set(id, e); }
    return e;
  };
  const score = (e: { reads: number; corrections: number }): number | null =>
    e.reads > 0 ? Math.round((100 * (e.reads - e.corrections)) / e.reads) : null;

  return {
    getReputation(id: string) {
      const e = m.get(id);
      if (!e || e.reads === 0) return null;
      return { score: score(e) as number, reads_logged: e.reads, corrections_logged: e.corrections };
    },
    full(id: string): RepFull | null {
      const e = m.get(id);
      if (!e) return null;
      return { score: score(e), reads_logged: e.reads, corrections_logged: e.corrections, by_tag: e.by_tag };
    },
    writeBack(id: string, v: ValidationResult): RepFull {
      const e = ensure(id);
      e.reads += 1;
      if (v.response < 100) {
        e.corrections += 1;
        const tag = !v.price_match ? 'missed_compensation' : 'quality_drift';
        e.by_tag[tag] = (e.by_tag[tag] ?? 0) + 1;
      }
      return { score: score(e), reads_logged: e.reads, corrections_logged: e.corrections, by_tag: e.by_tag };
    },
  };
}
