# Architecture review — crosswalk + one-pager (Sean partner-mode pass · 2026-05-30)

Skeptical-judge lens on `ERC8004_LIMINAL_CROSSWALK.md` + `INFRASTRUCTURE_TRACK_ONE_PAGER.md`. Per the
Sat 5/30 TODO ("verify Layer-2 framing is defensible to a hackathon judge").

## Verdict
The core composition is **defensible and now demonstrable** — the drop→read→correct→sign loop runs on
Algorand LocalNet with real txids, which most Infra-track entries won't have. The risk is the **gap
between the pitch and the runnable reality**. One landmine (the founders' call), a few real fixes (some
applied), and some framing to ground.

## 🔴 Landmine — the cited repo isn't where the Algorand code is (FOUNDERS' CALL — item 1)
One-pager cites **Repo: `liminal-agents`** (public, MIT, 83 tests). But all the x402 + Algorand +
correction-anchoring that *runs* lives in the **private `hackathons/algorand-berlin-2026/provenance`**
slice — `liminal-agents` has no Algorand code yet (it's the build target). A judge cloning the cited
repo finds no Algorand integration. **Decision needed:** which repo is the submission. Lean: make the
`algorand-berlin-2026` slice the demo spine (it runs) and cite `liminal-agents` as the proven substrate
it extends. Trade-off: the existing-project $3k angle leans on `liminal-agents`' 83 tests — hybrid
framing keeps both, but it's Shruti's positioning call.

## ✅ Verified REAL (not overclaims — I checked the code before flagging)
- **9-tag correction taxonomy** is real and frozen in `liminal-agents/lib/correction-tags.js`
  (`wrong_frame … off_by_layer`), confirmed by its CLAUDE.md. My initial "9 vs 4" flag was wrong: the
  pitch's 9-tag is accurate for `liminal-agents`; the LocalNet demo simply exercises a *different*
  taxonomy — the 4 `correction_kind` emission categories (inner/outer/cross/emergence) from the
  provenance/notion stream. Both real, different axes. (Clarifier added to the one-pager so a judge
  running the demo isn't confused.)

## 🟠 Real issues
- **Timeline math** (one-pager) — "7-10 working days inside the 8-day window to Jun 2" was inconsistent
  (May 30→Jun 2 is ~3 days) and over-optimistic. **FIXED:** reframed — the hack itself is the build
  window; pre-hack covers the x402 wiring only; the demo spine already runs. ✅ applied
- **Taxonomy confusion** (9 tags vs demo's 4 kinds) — **FIXED:** clarifier added to the honesty register. ✅ applied
- **"12 agents" vs the demo's 2** — the 12 are real in `liminal-agents` but the LocalNet demo uses 2 toy
  agents (Analyst/SDR) in the provenance repo. The one-pager doesn't claim the demo shows 12, but the
  pitch should make the seam explicit (or wire the demo to the 12 at the hack). Recommendation, not edited.
- **Layer-2 "THE gap" grandiosity** — reads as positioning your proprietary thing as the universal
  missing layer. Soften to "a substrate discipline the registries leave unspecified." Left for Shruti
  (positioning voice).
- **Only 2 of 3 ERC-8004 registries** touched (identity↔refusal, reputation↔correction); validation is
  hand-waved. Say so — scope is identity + reputation; validation is future.
- **PPA labels on a judge-facing surface** — the doc is internal-with-a-public-subset, so the labels are
  fine internally; the *public pitch subset* should describe behavior, not name PPAs. Honesty register
  already says this. Left as-is.

## 🟢 What holds up — lead with these
- **Zero-cost out-of-lane refusal on x402** — concrete, runnable, distinctive commerce-guard. Best 30 seconds.
- **Correction-stream ↔ ERC-8004-reputation composition** — the 3 distinctions (closed taxonomy,
  disagreement-preservation, counter-cyclical-to-capability) are a credible, honest novelty.
- **Hash-only anchoring on Algorand's note field** — verified on LocalNet; clean, privacy-preserving.
- **Infra-track positioning** (substrate + composability, not UX) — right lane, well argued.
- The criterion-7 honesty registers in both docs will earn judge trust.

## Applied in this pass
- one-pager: timeline reframed; two-taxonomy clarifier added.
- Held for founders: the repo-pointer (item 1); positioning softeners (Shruti's lane).

## Net
Substance is strong and has running code behind it. Close the pitch↔reality gap (repo pointer, agent
count in the demo) and it's a confident, honest Infrastructure submission.
