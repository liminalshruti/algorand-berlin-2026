# Registration record — Algorand Builders Berlin

**Submitted:** 2026-05-20
**Event:** Algorand Builders Berlin: Agentic Commerce x402 Hackathon
**Dates:** June 6 (9:00 AM) – June 7 (9:00 PM) GMT+2
**Venue:** 42 Berlin, Harzer Str. 42, 12059 Berlin, Germany
**Format:** On-site (≥1 team member must present on-site to pitch)
**Prize pool:** $20,000 USDC (50/50 split: half at award, half on milestone)
**Invited by:** 0xMihej
**Luma URL:** https://luma.com/agentic-commerce-hack

---

## Submitted form answers

| Field | Answer |
|---|---|
| Name | Shruti Rajagopal |
| Email | entertheliminalspace@gmail.com |
| Phone | +1 408 398 8170 |
| What describes you best? | Entrepreneur + Experienced developer |
| In person in Berlin? | **Yes** |
| Telegram username | No Telegram — iMessage at entertheliminalspace@gmail.com or +1 408 398 8170 |
| X (Twitter) handle | ShrutiRajagopal |
| GitHub username | liminalshruti |
| Building on Algorand? | Not yet — integrating x402 on Algorand for this hackathon (existing project, Infrastructure track) |
| Areas of interest | Agentic commerce + Infrastructure + AI agents |

### Building something now (free-text answer submitted)

> **Liminal Agents** — https://github.com/liminalshruti/liminal-agents
>
> Bounded multi-agent infrastructure: 12 specialist AI agents across 4 registers (Diligence, Outreach, Judgment, Operations) that read the same input and disagree. Each agent has a declared domain and refuses out-of-lane work — refusal is a first-class output, not an error. User corrections become durable rules that change the next read (correction stream). Local-first SQLite vault, HTTP API, full provenance. Won "most original architectural idea" at AgentHansa AI Agent Economy Hackathon (Apr 2026). For Berlin: integrating x402 settlement so agents transact with each other and structural guards prevent commerce-rogue behavior — Infrastructure track.

---

## Locked submission strategy

- **Target track:** Infrastructure ($7,500 pool; existing-project 1st place = $3,000)
- **Submission category:** Existing project (liminal-agents already shipped, 83 tests, hackathon-tested)
- **Submission spine decision:** judged runnable repo is `hackathons/algorand-berlin-2026`; cite `liminal-agents` as the existing substrate and `liminal-agents#40` as the product-integration companion.
- **Mandatory stack constraint:** All projects must implement x402 on Algorand to qualify for prizes
- **Net-new work for the hack:** x402 settlement layer wired into liminal-agents `/api/read` and `/api/refine` + Algorand testnet/mainnet deployment + demo scenario (~7–10 days Shayaun-time per repo-fit audit)
- **Team:** Shruti + Shayaun (max team size: 5, both will travel)
- **IP:** Per luma — "Your ideas and projects remain your intellectual property"

---

## Pre-event todos (next 48 hours)

- [ ] **Install Telegram + join the hackathon group:** https://t.me/+GUyxFWJbL582ZjAy
- [x] **Register for the June 3 pre-hack workshop:** https://app.livestorm.co/algorand-foundation/x402-workshop-on-algorand-june-2026 *(done 2026-05-20)*
- [x] **Book SF → Berlin flights** (arrive June 3 to acclimate before workshop, depart June 8) *(done 2026-05-20)*
- [ ] **Confirm Shayaun travel + dates align**
- [ ] **Email organizers** (via luma "Contact the Host"): confirm Infrastructure track accepts liminal-agents existing-project entry with x402 wedge. Final copy ready in `HOST_CONFIRMATION_MESSAGE_2026-05-30.md`.

## Post-acceptance todos (after invite confirmed)

- [ ] **Accommodation** (not provided by event) — book Berlin lodging near 42 Berlin (Neukölln)
- [ ] **Submission collateral:** repo writeup, one-pager, ~3-min demo video
- [ ] **Workshop attendance plan:** who attends June 3 (recommend both if in Berlin by then)

---

## Event context

### Two-tier project categories
- **New Projects** — code written during hackathon only (ideation pre-allowed)
- **Existing Projects** — pre-existing Web2 or Web3 projects integrating x402 on Algorand ← **our category**

### Two tracks
1. **Agentic Commerce** ($12,500) — AI agents transacting over x402 on Algorand. Examples: agents paying for services, pay-per-use API, agent-driven marketplaces.
2. **Infrastructure** ($7,500) ← **our track** — foundational components of the x402 ecosystem. Examples: facilitators, agent wallets, developer tooling, dashboards, libraries.

### Judging criteria (from luma)
- Technical sophistication
- Creativity
- Usability
- Value proposition
- Potential ecosystem impact
- *(Final decisions at Algorand Foundation's sole discretion)*

### 50/50 prize distribution
- 50% awarded after hackathon
- 50% unlocked after completing mutually agreed milestone (e.g., launching on Algorand mainnet)
- Unclaimed funds reallocated to other winning teams if milestones not pursued

### Hosts
- 42 Berlin Blockchain & friends events
- 0xMihej (invite source)
- AI Agents Berlin
- Algorand Foundation

### Logistics
- Full on-site access throughout the night
- Overnight hacking allowed
- Food + beverages provided
- Accommodation NOT included
- Remote participation allowed but ≥1 team member must be on-site for pitch

---

## Cross-reference

- Full recon synthesis: `RECON.md`
- Luma + ecosystem detail: `recon/01-luma-ecosystem.md`
- DARPA DICE parallel target: `recon/02-darpa-dice.md`
- Repo-fit audit (what's shippable): `recon/03-repo-fit-audit.md`
