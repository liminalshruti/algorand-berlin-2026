// Canonical packet serialization (Sean lane · Berlin AlgoHack OKR "canonical packet serialization").
//
// The hash that goes on Algorand commits to the *content* of a signed vault packet, but only the
// hash ever leaves the machine (see chain/* and the privacy fence). For that commitment to be
// independently verifiable months later — on a different machine, in a different language — the
// serialization must be CANONICAL: the same logical packet must always produce the same bytes,
// regardless of JS key-insertion order, array order of agent reads, or Unicode normal form.
//
// This is a deliberately small JSON Canonicalization Scheme (cf. RFC 8785 JCS), specialized to
// the packet domain:
//   1. Object keys are emitted in sorted (UTF-16 code-unit) order.
//   2. Strings are Unicode-normalized to NFC before encoding, so visually-identical text that
//      differs only in composed/decomposed form hashes the same.
//   3. `undefined` object members are dropped (they are not data); `null` is preserved (it is).
//   4. Non-finite numbers are rejected — they have no canonical JSON form.
//   5. No insignificant whitespace.
//
// The hash is domain-separated and version-bound: the bytes that feed SHA-256 are
// `"<DOMAIN_TAG>\n<canonical-json>"`. Bumping CANONICAL_VERSION changes DOMAIN_TAG, which changes
// every hash — that is intentional. A receipt carries `canonical_version` so a verifier knows
// which domain tag to reconstruct.

import { createHash } from "node:crypto";

/** Serialization version. Stored on every receipt as `canonical_version`. */
export const CANONICAL_VERSION = "1";

/** Domain separator mixed into the hash, bound 1:1 to CANONICAL_VERSION. */
export const DOMAIN_TAG = `liminal.packet.v${CANONICAL_VERSION}`;

/**
 * Deterministically serialize an already-projected canonical value to a string.
 * Accepts only JSON-shaped data: null, boolean, finite number, string, array, plain object.
 */
export function canonicalize(value: unknown): string {
  return encode(value);
}

/**
 * SHA-256 (hex) of the domain-separated canonical bytes. This is `packet_hash`.
 * Input is the canonical JSON string produced by {@link canonicalize}.
 */
export function hashCanonical(canonicalJson: string): string {
  return createHash("sha256").update(`${DOMAIN_TAG}\n${canonicalJson}`, "utf8").digest("hex");
}

function encode(v: unknown): string {
  if (v === null) return "null";

  switch (typeof v) {
    case "string":
      return JSON.stringify(v.normalize("NFC"));
    case "boolean":
      return v ? "true" : "false";
    case "number":
      if (!Number.isFinite(v)) {
        throw new Error("canonicalize: non-finite numbers (NaN/Infinity) have no canonical form");
      }
      return JSON.stringify(v);
    case "object": {
      if (Array.isArray(v)) {
        return `[${v.map(encode).join(",")}]`;
      }
      const obj = v as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
      const members = keys.map((k) => `${JSON.stringify(k)}:${encode(obj[k])}`);
      return `{${members.join(",")}}`;
    }
    default:
      // bigint, function, symbol, undefined-at-root
      throw new Error(`canonicalize: cannot encode value of type ${typeof v}`);
  }
}
