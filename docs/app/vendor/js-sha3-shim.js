// Shim for esm.sh's js-sha3: it only exposes a default export, but @perawallet/connect
// does `import { keccak_256 } from 'js-sha3'`. Import the self-contained (?bundle) build —
// a distinct specifier, so the import-map remap of the /es2022/ path doesn't recurse — and
// re-export the CJS members as named bindings.
import _m from "https://esm.sh/js-sha3@0.8.0?bundle";
const sha3 = (_m && _m.default) || _m;
export const keccak_256 = sha3.keccak_256, keccak_224 = sha3.keccak_224, keccak_384 = sha3.keccak_384, keccak_512 = sha3.keccak_512;
export const sha3_224 = sha3.sha3_224, sha3_256 = sha3.sha3_256, sha3_384 = sha3.sha3_384, sha3_512 = sha3.sha3_512;
export const shake_128 = sha3.shake_128, shake_256 = sha3.shake_256;
export const keccak224 = sha3.keccak224, keccak256 = sha3.keccak256, keccak384 = sha3.keccak384, keccak512 = sha3.keccak512;
export default sha3;
