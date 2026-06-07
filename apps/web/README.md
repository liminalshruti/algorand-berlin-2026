# Frontend (`apps/web/`)

A multi-page console behind a shared **left sidebar** (rendered *inside* the app frame),
all sharing the vendored Liminal design system. No build step — serve the folder statically.

```sh
npx serve apps/web        # then open any page, e.g. http://localhost:<port>/router.html
```

## Pages (one role each)

| Page | Role / JTBD |
|---|---|
| `router.html` | **Trust Router** (operator) — request → rank → pay → validate → re-run that reroutes off a caught agent. The demo centerpiece. |
| `marketplace.html` | **Marketplace** (client) — discover agents by earned trust; leave a **verified, payment-anchored** review. |
| `studio.html` | **Agent Studio** (owner) — fetch & manage *your* agents (identity, metadata, replies). |
| `contracts.html` | **Contracts** (developer) — deployed ARC-8004 app-ids + the full ABI, callable. |
| `admin.html` | **Admin** (observability) — KPIs, ARC-28 transaction ledger, validations queue, health. |
| `mcp-sign.html` | **MCP payment signer** — Pera handoff page for Claude Code `liminal_request_payment.sign_url`. |

Sidebar: `nav.js` + `nav.css` (injected into `.frame`). Engine: `registry.js` + `arc8004.js`
drive marketplace/studio/contracts/admin by `body[data-view]`; the trust router is `router.{html,js,css}`.

## Live wiring

`router.js` top:
```js
const BASE_URL = "http://localhost:3001";
const LIVE = { route: true, pay: true, validate: true, reputation: true, ledger: true };
```
Per-endpoint mock↔live switch with a **server health probe** and graceful per-endpoint mock
fallback, so the loop runs whether the server is up, partially live, or down. The ARC-8004
console (`arc8004.js`) is mock-first — an ABI-faithful client with the spec guards (verified
proof-of-payment reviews, self-feedback/self-validation prevention, satisfaction-based trust).

The trust router consumes the frozen API: `POST /api/route`, `POST /api/pay`, `POST /api/validate`,
`GET /api/reputation`, `GET /api/ledger`, `GET /api/agents`.

The MCP signer consumes `GET /api/challenge/:challenge_id` and `POST /api/payment-proof`; it signs the
selected challenge payment through `wallet.js` on TestNet.

## Files

| File | Role |
|---|---|
| `router.{html,js,css}` | trust-router flow (desktop-app shell) |
| `mcp-sign.{html,js}` | Pera signing bridge for Claude Code MCP payment challenges |
| `marketplace/studio/contracts/admin.html` | the four console pages (thin wrappers) |
| `registry.{js,css}` | engine + styles for the console pages |
| `arc8004.js` | mock-first ARC-8004 client (Identity/Reputation/Validation) |
| `nav.{js,css}` | shared in-frame sidebar |
| `design-tokens.css` · `cut-shell.css` · `brand-upgrade.css` + `fonts/` | vendored Liminal design system |

Chain context (network + contract app-ids / settlement) shows bottom-right on every page.
`registry.html` redirects to `marketplace.html` (legacy combined console).
