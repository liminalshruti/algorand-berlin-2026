# Trust Router UI (`public/`)

The visible layer over the four backend lanes — the x402 trust router rendered
as **a flow inside the Liminal desktop app** (the slate-tray shell). Built
**mock-first**: it renders the full loop with the backend OFF.

The router maps onto the desktop-app surface:

- **left rail** — Route box + ranked providers (case-items)
- **center slate** — selected provider → brief (approve gate) → **signed packet**
  (the paper `dispo-artifact` with SHA-256) → **ledger** (audit ribbon)
- **right rail** — **Trust Registry** (earned reputation; the caught provider drops)

## Run

No build step. Serve the folder statically and open `router.html`:

```bash
# from repo root
npx serve public        # or: python3 -m http.server -d public 8080
```

Then open `http://localhost:<port>/router.html`.

## The loop it demonstrates

1. **Request** — operator types a task in the left rail, picks a register lane, hits Route.
2. **Rank** (left rail) — competing providers ranked by `trust = 0.3·price + 0.4·reputation + 0.3·validation`; weighted-lottery pick selected; the registry (right rail) shows current reputation.
3. **Brief / approve gate** (center) — the selected provider's quote + disposition: **Approve & pay** / **Deny**.
4. **Pay & validate** — x402 settlement; the metric band shows quoted vs settled with the **hidden-fee gap in red**; price-vs-quote verdict + `response 0..100`.
5. **Signed packet** (center) — a paper `dispo-artifact` with the disposition, verdict, **reputation delta**, ledger anchor count, and a SHA-256 — plus the **Re-run** handoff.
6. **Ledger** (audit ribbon) — every settle + verdict anchor, hash-only, with explorer links; the titlebar ledger pill counts anchors.
7. **Re-run** — re-routes the same request; the caught provider has dropped in the registry, so the router **self-corrects to the honest provider**. This is the demo centerpiece.

## Mock → live

Everything goes through `api.*` in `router.js`. To point at the real
router-server, set one const at the top of `router.js`:

```js
const API_BASE = "http://127.0.0.1:8787";   // null = mock
```

The UI codes to the frozen API (`TEAM_SWIMLANES_2026-06-06.md`):
`POST /api/route`, `POST /api/pay`, `POST /api/validate`,
`GET /api/reputation?provider=…`, `GET /api/ledger`.

## Files

| File | Role |
|---|---|
| `router.html` | structure on the desktop-app shell (frame, rails, slate, registry) |
| `router.css` | per-cut overrides only (consumes the shell + tokens; no token redefinition) |
| `router.js` | mock backend + the route→rank→pay→validate→re-run state machine |
| `design-tokens.css` | vendored Liminal design tokens (canon from `liminal-prototype`) |
| `cut-shell.css` | vendored desktop-app shell (frame chrome, rails, slate, brief, dispo, audit) |
| `brand-upgrade.css` + `fonts/` | vendored brand serif/display faces (Perfectly Nineties, Nineties Headliner) |

**This repo is the single home for the trust-router frontend.** The Liminal
design system (`design-tokens.css`, `cut-shell.css`, `brand-upgrade.css`, fonts)
is vendored here so the judged repo renders identically to the desktop app with
no external dependency — edit the UI here, not in `liminal-prototype`.
