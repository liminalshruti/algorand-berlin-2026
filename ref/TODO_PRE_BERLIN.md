# Pre-Berlin Algorand Hackathon — Todo Checklist

**Drafted:** 2026-05-29 evening
**Departure:** Tue Jun 2, 4:30 PM PT SFO → Berlin (arrive Jun 3 to acclimate before workshop)
**Workshop:** Jun 3 6:00 PM CEST (livestorm — pre-hack)
**Hackathon:** Jun 6-7, 42 Berlin, Harzer Str. 42
**Window remaining:** ~3.5 days solo + ~1 day Sean (Sat 5/30, see [[project_sean_saturday_availability_2026-05-30]])
**Current audit:** 2026-06-01 — runnable spine and companion both verified on LocalNet; public testnet is blocked on funded wallets.

---

## Lane structure

Following `decisions/2026-04-21-mvp-timeline-3w.md` lane-separation:

- **Shruti lane:** strategic substrate, submission collateral, brand/positioning, founder-relationship management
- **Sean lane:** code-substrate, integrations, build/deploy, technical demo
- **Both lane:** demo scenario design, repo writeup, final video review

---

## Fri 5/29 evening (SOLO — TONIGHT)

- [x] Commit ERC-8004 crosswalk substrate to hackathons repo (commit `2d18a59`)
- [x] Draft Infrastructure-track one-pager (commit `90126be`)
- [x] Draft this pre-Berlin todo checklist (this file)
- [ ] **Install Telegram + join hackathon group** — `https://t.me/+GUyxFWJbL582ZjAy`
- [ ] **Email organizers via Luma "Contact the Host"** — confirm Infrastructure track accepts liminal-agents existing-project entry with x402 wedge. Final copy is ready in `HOST_CONFIRMATION_MESSAGE_2026-05-30.md`.

- [ ] **Book Berlin accommodation** near 42 Berlin (Neukölln) Jun 3-8

## Sat 5/30 (BOTH — Sean's one full day before Berlin-prep dominates)

- [x] **Sean architecture review** of `ERC8004_LIMINAL_CROSSWALK.md` + `INFRASTRUCTURE_TRACK_ONE_PAGER.md` — partner-mode pass captured in `ARCHITECTURE_REVIEW_2026-05-30.md`
- [ ] **Confirm Shayaun travel + dates align** — flight, lodging, workshop attendance Jun 3
- [x] **Sean: x402 scoping pass** — integration points and day-count captured in `X402_INTEGRATION_SCOPING.md`
- [x] **Joint demo scenario draft** — concrete run-of-show captured in `DEMO_SCENARIO.md`:
  - Step 1: Agent-A makes a claim (which agent? what claim?)
  - Step 2: Agent-B challenges via correction (which tag from the 9-tag taxonomy?)
  - Step 3: Correction lands on Liminal substrate (correction event with `correction_kind` field)
  - Step 4: Reputation registry updates + anchor lands on Algorand note field
- [ ] **Decide: ERC-8004 separate submission at AIS26 (Jun 19-21)?** — same substrate, two hacks, two submissions OR sequenced narrative? Open question from crosswalk §"Open questions for Shruti" #2

## Sun 5/31 (SOLO — high collision risk with mom medical procedure per LIM-1052)

- [ ] **Sunday OSINT virtual conference** — May 31 11 AM PT (per other-session todo)
- [ ] **Aravinda pre-read final pass** (LIM-1040) if bandwidth — gates on founder-debt receipt scan (LIM-1041) which is gated on mom procedure
- [ ] **Wave 1B supplementals USPTO filing** (if Sat filings completed)
- [ ] **Berlin packing + travel prep** if any bandwidth remains

## Mon 6/1 (SOLO)

- [ ] **11 AM PT Aravinda call** — Wave 1 post-filing review + entity name decision + Jun 3 substrate
- [ ] **Final repo writeup pass** — README.md update on liminal-agents for hack judges
- [ ] **Pack + final flight prep**

## Tue 6/2 (DEPARTURE)

- [ ] **4:30 PM PT — SFO → Berlin departure (HARD)**

## Wed 6/3 (BERLIN — arrival day)

- [ ] **Arrive Berlin (overnight flight)**
- [ ] **6:00 PM CEST — pre-hack workshop** (livestorm + in-person if energy allows)
- [ ] Recon visit to 42 Berlin venue if time permits

## Thu 6/4 - Fri 6/5 (PRE-HACK DAYS)

- [x] **Sean: x402 settlement layer implementation in liminal-agents** — companion code is on `liminal-agents/main`; `sandbox/bin/x402-localnet-proof.js` verified 2026-06-01
- [ ] **Shruti: demo collateral** — ~3min demo video script + repo writeup + judge-facing one-pager final
- [ ] **Test Algorand testnet deployment** with public x402 endpoint — blocked 2026-06-01 on funded testnet wallets; current provenance testnet account `QMN37XAIZPHBO5MB6GRHRMC6QBINJ4WOGQCUBZKPAXB4OSP2NTRGU6LE2U` has 0 microAlgos
- [ ] **Telegram engagement** — participate in hackathon group, watch for judge intel, build rapport with 0xMihej
- [x] **Decide x402 pricing scheme** — demo path uses 10,000 microAlgos per priced read; refusals remain zero-cost

## Sat 6/6 (HACKATHON DAY 1)

- [ ] **9:00 AM — Hackathon opens at 42 Berlin**
- [ ] Submit existing-project category entry early
- [ ] Wire ERC-8004 reputation registry pattern into `liminal-agents` substrate
- [ ] Run demo scenario end-to-end on testnet
- [ ] Identify judges + start conversations

## Sun 6/7 (HACKATHON DAY 2)

- [ ] **Demo pitch** — 5-min live pitch using INFRASTRUCTURE_TRACK_ONE_PAGER as substrate
- [ ] **9:00 PM — Hackathon closes**
- [ ] Award ceremony / next-step capture

## Post-hack (Mon 6/8)

- [ ] **Depart Berlin → SF**
- [ ] **Post-hack retro** within 48hr
- [ ] **Convert wins/contacts** into founder-brain stakeholder map updates
- [ ] **Decide AIS26 submission** (Jun 19-21 if go-decision was made Sat 5/30)

---

## Cross-references

- [[project_sean_saturday_availability_2026-05-30]] — Sean's only full pre-Berlin day
- [[project_ppa_filing_state]] — Wave 1 USPTO filings overlap with this prep window
- `algorand-berlin-2026/RECON.md` — full event recon
- `algorand-berlin-2026/REGISTRATION.md` — submitted form + locked submission strategy
- `algorand-berlin-2026/ERC8004_LIMINAL_CROSSWALK.md` — substrate map
- `algorand-berlin-2026/INFRASTRUCTURE_TRACK_ONE_PAGER.md` — judge-facing derivative
- LIM-1052 — Sun 6/1 scheduling collision (mom procedure)
- LIM-1040 — Aravinda pre-read final pass + send
- LIM-1041 — Founder-debt receipt scan (gates Aravinda pre-read)

---

## What to be honest about

- **Sean bandwidth is the load-bearing constraint.** If Sat doesn't materialize as expected, the x402 integration timeline slips. Have a fallback: if Sat is lost, the demo runs against testnet stubs instead of fully wired x402 settlement.
- **Sunday collision is a real risk.** Mom procedure + Aravinda pre-read + Wave 1B filings + OSINT conference all stacked on Jun 1. Pick 2 to actually do; defer the rest.
- **Workshop attendance Jun 3 is recommended but not required.** If overnight flight + jet lag makes it unviable, the workshop replay should be available.
- **The crosswalk + one-pager are DRAFT.** Pre-counsel-review. Don't publish either externally before Shruti ratification + (ideally) Aravinda or Judith review.
