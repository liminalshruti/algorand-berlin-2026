# Trust Router UI (`public/`)

The visible layer over the four backend lanes — the operator's view of the
x402 trust router. Built **mock-first**: it renders the full loop with the
backend OFF.

## Run

No build step. Serve the folder statically and open `router.html`:

```bash
# from repo root
npx serve public        # or: python3 -m http.server -d public 8080
```

Then open `http://localhost:<port>/router.html`.

## The loop it demonstrates

1. **Request** — operator types a task, picks a register, hits Route.
2. **Rank** (View 1) — competing providers ranked by `trust = 0.3·price + 0.4·reputation + 0.3·validation`; weighted-lottery pick highlighted; operator approve/deny gate.
3. **Pay & settle** (View 2) — x402 settlement; txid(s) with explorer links; **quoted-vs-settled gap shown in red** when a provider sneaks a hidden fee.
4. **Validate & reputation** (View 3) — price-vs-quote verdict, `response 0..100`, and the **reputation delta** (the caught provider's score drops, anchored on-chain).
5. **Ledger** (View 4) — every settle + verdict anchor, hash-only, with explorer links.
6. **Re-run** — re-routes the same request; the caught provider has dropped, so the router **self-corrects to the honest provider**. This is the demo centerpiece.

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
| `router.html` | structure + the four views |
| `router.css` | chrome + layout (consumes `design-tokens.css`; no token redefinition) |
| `router.js` | mock backend + the request→rank→pay→validate→re-run state machine |
| `design-tokens.css` | vendored Liminal design tokens (canon from `liminal-prototype`) |

A catalog mirror of this UI lives at
`liminal-prototype/cuts/09-trust-router.html` for design-system review.
