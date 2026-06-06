// Plain-JS test helpers. This file lives OUTSIDE smart_contracts/, so the puyaTsTransformer
// does NOT rewrite it — vanilla bigint arithmetic (shifts etc.) behaves normally here.
// Contract specs import these to build/decode int128 values without tripping AVM op semantics.

const TWO_128 = 1n << 128n
const TWO_127 = 1n << 127n

/** Encode a signed int128 as a 32-char (16-byte) big-endian two's-complement hex string. */
export function i128Hex(n: bigint): string {
  const u = n < 0n ? TWO_128 + n : n
  return u.toString(16).padStart(32, '0')
}

/** Decode a big-endian hex string as a signed int128. */
export function twosToBigInt(hex: string): bigint {
  const u = BigInt('0x' + (hex === '' ? '0' : hex))
  return u >= TWO_127 ? u - TWO_128 : u
}

/** Bytes-like (Uint8Array/array/hex string) -> hex string. */
export function extToHex(v: unknown): string {
  if (typeof v === 'string') return v.replace(/^0x/i, '')
  if (v instanceof Uint8Array) return [...v].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (Array.isArray(v)) return v.map((b) => Number(b).toString(16).padStart(2, '0')).join('')
  return [...new Uint8Array(v as ArrayBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
