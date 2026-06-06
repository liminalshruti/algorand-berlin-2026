import { biguint, BigUint, Bytes, bytes, arc4 } from '@algorandfoundation/algorand-typescript'

/**
 * Signed 128-bit integer helpers.
 *
 * ERC-8004 reputation `value` is `int128`. The AVM has no native signed/128-bit
 * arithmetic, so we port the wire/storage layout 1:1 (two's-complement, big-endian,
 * 16 bytes — identical to Solidity int128) and do the small amount of on-chain math we
 * need (getSummary netting) by splitting into sign + magnitude and using native biguint.
 *
 * Note: biguint arithmetic loses its branded type at the TS layer (it widens to `bigint`),
 * so each result is re-wrapped with `BigUint(...)`.
 *
 * See ref/ERC8004_AVM_MAPPING.md §2.4.
 */

// 16 zero bytes — used to left-pad a variable-length big-endian magnitude back to 16 bytes
// (bitwiseOr zero-left-extends the shorter operand to the wider one).
const ZERO16: bytes = Bytes.fromHex('00000000000000000000000000000000')

// 2**128 and 2**127 as biguint constants.
const TWO_POW_128: biguint = BigUint(340282366920938463463374607431768211456n)
const TWO_POW_127: biguint = BigUint(170141183460469231731687303715884105728n)

/** True if the 16-byte two's-complement value is negative (high bit set). */
export function isNegativeI128(v: bytes): boolean {
  return BigUint(v) >= TWO_POW_127
}

/** Absolute value (magnitude) of a 16-byte signed int128, as a biguint. */
export function magnitudeI128(v: bytes): biguint {
  const u: biguint = BigUint(v)
  return u >= TWO_POW_127 ? BigUint(TWO_POW_128 - u) : u
}

/**
 * Net a running sum expressed as separate positive- and negative-magnitude totals back
 * into a 16-byte two's-complement int128. Exact as long as the net magnitude fits int128
 * (the common case for bounded reputation scores); callers aggregate large datasets off-chain.
 */
export function encodeNetI128(posSum: biguint, negSum: biguint): arc4.StaticBytes<16> {
  if (posSum >= negSum) {
    const mag: biguint = BigUint(posSum - negSum)
    return new arc4.StaticBytes<16>(ZERO16.bitwiseOr(Bytes(mag)))
  }
  const mag: biguint = BigUint(negSum - posSum)
  const twos: biguint = BigUint(TWO_POW_128 - mag)
  return new arc4.StaticBytes<16>(ZERO16.bitwiseOr(Bytes(twos)))
}
