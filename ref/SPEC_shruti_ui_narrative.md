# SPEC — Shruti · UI + Narrative

**Lane:** the visible interaction layer over every backend lane + the submission narrative.
**Owns:** `public/router.html`, `public/router.js`, `public/router.css` + demo video, pitch deck, pitch script.

## Abstract

Build the operator-facing UI that makes the trust loop legible — request → ranked providers → pay →
validate → re-route — and own the narrative artifacts judges see: demo video, pitch deck, pitch script.

## Motivation

The demo lives or dies on one beat landing visually: a provider gets **caught cheating on-chain, its
reputation drops, and the next route avoids it.** The UI exists to make that beat unmistakable, and the
narrative frames why it matters.

## Specification

### Four views (driven entirely by the frozen API)
1. **Request** — task input → `POST /api/route`.
2. **Ranked providers** — table: name · price · reputation · trust_score · lottery weight; highlight
   the pick; approve/deny gate.
3. **Settlement + validation** — show `settle_txid` (explorer link), then quoted-vs-settled with the
   **gap flagged red** on a hidden fee; the verdict; the reputation delta.
4. **Ledger** — `GET /api/ledger` list of anchored txids (decision / pay / verdict), each linking to
   the explorer.

### Build approach
- **H1:** build entirely against a **mock fetch** (hard-coded contract-shaped responses) so you never
  wait on the backend.
- **H3:** flip to the live server via a single base-URL constant.

### Narrative artifacts
- **Pitch script** (~75s): hook ("marketplaces rank by price → cheapest wins → hidden fees") →
  problem (no earned trust layer) → solution (trust router; reputation earned via on-chain validation)
  → demo (the caught-cheating reroute) → why Algorand (cheap, instant finality, 1KB note) → vision.
- **Pitch deck:** ~6 slides mirroring the script + the dataflow + the honesty seam.
- **Demo video:** the 4-view loop, ≤3 min, ending on the reroute + the verifiable ledger.

## Rationale

The UI is the only lane that consumes *all* backend lanes, so a mock-first build keeps Shruti unblocked
and makes her the natural integration-gap spotter. The narrative is what converts a working demo into a
winning submission.

## Security / Risk Considerations

- Never block on the chain in the render path (settle/validate can be slow) — show pending states.
- Keep the honesty seam in the deck/script: ERC-8004-*shaped* (not deployed on Algorand); mock + live
  providers; LocalNet is an honest demo surface.
- No private-repo names or internal/IP language in any judge-facing artifact.

## Definition of Done

- The full loop clicks through end-to-end, including the re-run that routes away from the cheater.
- Works mock-first, then against the live server.
- Pitch script + deck + demo video drafted (UI by code-complete; narrative into pitch-prep morning).

## QA — success criteria (run before PR)

- [ ] renders fully with the backend **off** (mock mode), no console errors.
- [ ] ranked table shows price / reputation / trust / weight; pick highlighted.
- [ ] settle view shows txid (explorer link) + quoted-vs-settled, **gap in red** on a hidden fee.
- [ ] validation view shows verdict + reputation delta.
- [ ] re-run after the cheat **visibly** routes to a different provider.
- [ ] ledger lists anchored txids with explorer links.
- [ ] mock→live flips via one base-URL constant.

## Dependencies

- **Consumes:** the frozen API from all three backend lanes (Reza `/route`, Navid `/pay` + `/ledger`,
  Shayaun `/validate` + `/reputation`). Depends on everyone; blocks no one.
