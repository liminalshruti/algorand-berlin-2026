# Deck Design Handoff — Liminal · Trust Router

Hand this to the design agent ("claude design" / Figma / Gamma / Canva / HTML). It turns
`PITCH_DECK.md` (6 slides + appendix) into a branded, on-system pitch deck. **Content is locked in
`PITCH_DECK.md`** — this file is the *visual* spec only.

> **One-line brief for the design agent:** Build a 16:9 dark deck for "Liminal — the trust layer for
> the agent economy." Near-black ground, warm-cream text, an electric triad of **Liminal pink
> `#E90095`**, **cerulean blue `#197EEB`**, and **electric green `#70F32F`**. Serif display
> (Perfectly Nineties), Geist body, Geist Mono for labels/txids. Confident, infrastructural, a little
> electric — frontier, not corporate. Color does narrative work (see role map). 6 core slides + close.

---

## 0 · How to consume the system
- **Tokens are canon:** `apps/web/design-tokens.css` (Liminal 12-wheel). Import it; don't redefine hexes. Every value below is a real token.
- **Fonts (local):** `apps/web/fonts/` — `nineties-headliner.otf`, `PerfectlyNineties-*.otf`. Geist + Geist Mono are system/CDN.
- **WCAG AA:** body text ≥ 4.5:1, large text/UI ≥ 3:1 on near-black. The triad on `#0A0A0B` passes for large text; for small cream body use `--text #F4F2EE`.

## 1 · Palette + role map (color does the storytelling)
| Role in the deck | Token | Hex | Used for |
|---|---|---|---|
| Ground | `--bg` | `#0A0A0B` | every slide background |
| Text | `--text` / `--text-mid` / `--text-mute` | `#F4F2EE` / `#C9C5BD` / `#56534D` | body, captions, fine print |
| **Brand / verdict / conscience** | `--wholeness` (Liminal Pink) | `#E90095` | wordmark, tagline, "we give the marketplace a conscience," the verdict moment |
| **Live / verified / honest** | `--lime` / `--signal` (electric green) | `#70F32F` | "deployed on TestNet," real txids, the honest vendor, the successful reroute, app-id chips |
| **Chain / infrastructure** | `--cerulean` / `--depth` (blue) | `#197EEB` | the 4-layer stack, registries, the loop spine, structural diagrams |
| **Cheat / drift / overcharge** | `--stability` / `--alarm` (red) | `#ED214F` | the cheapest vendor, "charged +50% vs quote," the caught/flagged state |
| Fills/tints | `*-100` / `*-bg` | e.g. `rgba(233,0,149,0.09)` | soft chips, panel backings (use the `-100` alpha stops, never flat pastels) |

**Gradient rule (from the system):** adjacent-hue blends only. The triad is 90° apart on the wheel, so **keep the three as discrete accents on black — do not blend them**. Use single-hue *glows* (`--*-glow`) for depth. Allowed brand blend if you need one: pink→orchid→violet (`--blend-orchid-to-wholeness`).

## 2 · Typography
- **Display / slide titles / tagline:** `--display` = "Nineties Headliner" → "Perfectly Nineties" serif. Tight tracking `--ls-display -0.038em`. Sizes `--fs-display 64px` (title), `--fs-3xl 36px` (slide H2).
- **Body / bullets:** `--sans` = Geist, `--fs-lg 19px` / `--fs-md 17px`, leading `--lh-normal 1.45`.
- **Labels / eyebrows / txids / app-ids / metrics:** `--mono` = Geist Mono, uppercase, `--ls-mono 0.18em`, `--fs-eyebrow 10px` / `--fs-mono 12px`. *(All app-ids, hashes, explorer links render in mono.)*
- One serif display line per slide max; everything else sans/mono. ≤12 words per on-screen line.

## 3 · Layout, grid, motion
- 1920×1080 (16:9). Margins from `--space-9 64px`; inter-block `--space-6 28px`. Radii `--radius-4 6px` (chips) / `--radius-5 14px` (cards).
- Optional **64px atmospheric lattice** at ~1.4% white (the `body::before` grid) on title/close for texture.
- Bottom-right **chain badge** echoing the app: mono `ALGORAND · TESTNET` + app-id chips (green).
- Motion (if animated/Gamma/HTML): `--tx-settle 0.32s` slide-ins; the **FLIP reroute** is the one hero motion — 1.5s hold.

## 4 · Slide-by-slide visual spec
Maps 1:1 to `PITCH_DECK.md`. Dominant accent in **bold**.

1. **Title** — near-black + lattice. `◇ Liminal` wordmark in **pink**, serif. Tagline below in cream serif; "conscience" clause in **pink**. Mono proof-line in **green**: `Live on Algorand TestNet · x402 · 3 registries deployed`. Lower corner: Algorand · Infrastructure.
2. **Why now / problem** — a vendor ranking list (cream rows). #1 row "cheapest" tagged with a **red** `charged +50% vs quote` sticker at settlement. Punch line in cream serif; "rates itself" in **red**. Caption mono: *cross-org agent procurement, no earned trust.*
3. **Solution / loop** — the 6-beat **ring** (Request · Rank · Pay · Validate · Reputation · Re-run) in **blue** strokes; center node **pink**; the *Validate→Reputation* arc tints **green** (honest) with a **red** "caught" tick. One-sentence solution line above in serif.
4. **DEMO ★** — title card only (you cut to the app). Big **pink** "LIVE DEMO," **green** "the caught-cheating self-correction." Tiny mono "fallback: recorded clip."
5. **Why defensible** — the 4-layer stack as stacked bars: L1 Algorand **blue**, **L2 Earned-trust highlighted in pink** (the layer we built), L3 ERC-8004 registries cream/blue, L4 x402 neutral. Right rail: three **green** app-id chips (`764031067 / 764031363 / 764031094`) → explorer, + a mono line "register→pay→review→validate audit trail." 
6. **Vision · Roadmap · Ask** — left: **pink** vision line ("the wedge is trust; the company is the control plane"). Center: **green** "Live today" row + a **blue** 3-step roadmap arrow. Right: the **pink** Ask. Footer: tagline large in **pink** serif. Optional small repo QR.
- **Close / end card** — black + lattice; tagline centered, serif, **pink**; under it a mono **green** line: repo URL · `Algorand · Infrastructure` · TestNet app-ids.
- **Appendix A1–A5** (Q&A only, neutral) — cream on black, mono headers, minimal accents; these are reference, not presented.

## 5 · Reusable motifs to build as components
- **Vendor row** (rank #, name, price, reputation bar, validation tick) — green tick = honest, red sticker = drift.
- **Loop ring** — six labelled nodes, blue spine, pink hub.
- **Stack bars** — 4 layers, L2 pink-highlighted.
- **App-id chip** — mono, green, links to `lora.algokit.io/testnet/application/<id>`.
- **Chain badge** — bottom-right, mono, matches the live UI.

## 6 · Real assets to embed (verifiable — judges will check)
- **Registries (TestNet):** Identity `764031067` · Reputation `764031363` · Validation `764031094` → `lora.algokit.io/testnet/application/<id>`.
- **Audit trail:** `audit/LATEST.md` — register → pay → review → validate, real txids, 3 wallets.
- **Tagline (verbatim):** "ERC-8004 gives agents a passport. We give the marketplace a conscience."

## 7 · Build options (pick one)
- **Figma** — `/figma-generate-design` then `use_figma`; create a 1920×1080 frame set, import the OTF fonts, build the 5 component motifs, lay out 6+close.
- **Gamma / Canva** — paste the one-line brief + the role map + slide specs; set theme colors to the four hexes + near-black; upload the fonts.
- **HTML/reveal.js** — fastest on-brand path: `<link>` `design-tokens.css`, one section per slide, tokens do the rest; export to PDF.

*(I can drive any of these directly — say which and I'll generate it.)*
