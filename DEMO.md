# Demo Runbook

Step-by-step instructions for running the current TestNet demo locally.

## 1. TestNet Prerequisites

- Use Pera Wallet on Algorand TestNet.
- Fund the Pera wallet with TestNet ALGO.
- The project defaults to TestNet through `.env.demo`.

## 2. Install

Run once from the project root:

```bash
npm install
```

## 3. Start The Demo Stack

Open three terminals from the project root.

### Terminal 1: Local x402 Agents

```bash
npm run agents:local
```

This serves the local Honest/Cheat MCP x402 providers:

- Honest Agent: `http://localhost:4021/honest/mcp`
- Cheat Agent: `http://localhost:4021/cheat/mcp`

Expected behavior:

- Honest quote probe: `0.10 ALGO`
- Honest execution challenge: `0.10 ALGO`
- Cheat quote probe: `0.04 ALGO`
- Cheat execution challenge: `0.06 ALGO`

### Terminal 2: Trust Router API

```bash
LOW_SPEND_SMOKE=true WEB_BASE_URL=http://localhost:3000 npm start
```

This starts the router on `http://localhost:3001`.

Notes:

- `LOW_SPEND_SMOKE=true` prevents automatic top-ups during boot.
- `WEB_BASE_URL=http://localhost:3000` makes MCP payment requests return a signer URL under the local web app.
- If low-spend mode aborts because a wallet is underfunded, top up the listed TestNet wallet or use the main UI demo path.

### Terminal 3: Web UI

```bash
npx serve -l 3000 apps/web
```

Open:

```txt
http://localhost:3000/router.html
```

## 4. Preflight

Before presenting:

1. Open `http://localhost:3000/router.html`.
2. Confirm the bottom-right badge says `ALGORAND · TESTNET`.
3. Confirm the source indicator says the server is online.
4. Press `P` for present mode.

Optional non-spending checks:

```bash
npm test
npm run check-types
npm run register:testnet-agents -- --check
```

## 5. Main UI Demo

This is the stage-friendly Trust Router flow. It shows route, quote drift, validation, reputation drop, and reroute from the main UI.

Important: the main `Approve & pay` button uses the UI proof-path demo with a synthetic settlement by default and can fall back to the legacy router-settled shim. The real Pera no-custody payment flow is in section 6.

### Step 1: Open Trust Router

Open:

```txt
http://localhost:3000/router.html
```

Press `P` for present mode.

### Step 2: Route A Diligence Task

Click:

```txt
Routing-mismatch read
```

Or press:

```txt
R
```

Expected screen:

- Ranked agents appear in the left rail.
- The cheap agent should lead first.
- The flow spine moves from Request to Rank.

Say:

```txt
The router ranks vendor agents by price plus earned reputation.
```

### Step 3: Approve The Selected Agent

Click:

```txt
Approve & pay
```

Or press:

```txt
A
```

Expected screen:

- The UI requests an x402 challenge from the selected local agent.
- The quote amount and challenge amount are shown.
- Cheat behavior should show a challenge above the quote: `0.04 ALGO` quoted, `0.06 ALGO` charged.

Say:

```txt
The cheapest agent wins first, but the x402 challenge asks for more than the active quote.
```

### Step 4: Show Validation

Wait for the validation result.

Expected screen:

- Quote drift is marked.
- Validation evidence appears.
- Reputation drops for the caught agent.
- Ledger rows update with hash-only anchors or validation evidence.

Say:

```txt
The router validates the payment evidence against the quote and lowers reputation for quote drift.
```

### Step 5: Re-run The Same Request

Click:

```txt
Re-run request
```

Expected screen:

- The caught agent drops in ranking or is held out.
- An honest agent leads the route.

Say:

```txt
The next route uses earned reputation, so the caught agent no longer wins on cheap pricing alone.
```

### Step 6: Open The Ledger

Click the ledger pill in the title bar.

Expected screen:

- Ledger rows show schemas, refs, hashes, rounds, and txids.
- Explorer links open on `lora.algokit.io/testnet`.

Say:

```txt
The demo anchors evidence hash-only on Algorand TestNet, so the audit trail is verifiable without exposing private payloads.
```

## 6. Real MCP And Pera Payment Flow

This is the real no-custody TestNet payment path. It uses Claude Code MCP plus `mcp-sign.html`.

Keep Terminals 1, 2, and 3 running.

### Terminal 4: Claude Code MCP Setup

Register the router MCP facade:

```bash
claude mcp add --transport http liminal http://localhost:3001/mcp
```

The router exposes these Liminal tools:

- `liminal_list_services`
- `liminal_route_task`
- `liminal_request_payment`
- `liminal_record_payment_proof`
- `liminal_invoke_paid_service`

### Step 1: List Services In Claude Code

Ask Claude Code:

```txt
List Liminal services.
```

Expected result:

- `diligence.report` is available.
- Honest/Cheat agent options are visible through the routed service catalog.

### Step 2: Route A Task In Claude Code

Ask Claude Code:

```txt
Route a diligence.report task: partner email says rejected but dashboard says in-review.
```

Expected result:

- Claude receives a `route_id`.
- Claude receives ranked route options with `option_id` values.

### Step 3: Request Payment

Ask Claude Code to request payment for the selected route option.

Expected result:

- Claude receives a `challenge_id`.
- Claude receives a `sign_url`.
- The `sign_url` points to:

```txt
http://localhost:3000/mcp-sign?challenge_id=...
```

### Step 4: Sign In The Browser

Open the returned `sign_url`.

On the MCP signer page:

1. Confirm the challenge facts.
2. Confirm the amount and `pay_to` wallet.
3. Click `Connect Pera`.
4. Sign the TestNet payment in Pera.

Expected result:

- `mcp-sign.html` sends payment directly from the Pera wallet to the selected agent wallet.
- The note binds the payment to the x402 challenge.
- The page posts the real `settlement_txid` to `/api/payment-proof`.
- The page shows `Proof accepted`.

### Step 5: Invoke The Paid Service

Back in Claude Code, invoke the paid service after proof is accepted.

Expected result:

- Unpaid challenges are rejected.
- Accepted proofs allow `liminal_invoke_paid_service`.
- The router forwards the call to the selected local MCP x402 provider with `X-PAYMENT`.

## 7. Demo Beats

Use these as the live narration beats:

1. Cheapest agent wins first.
2. x402 challenge asks for more than the quote.
3. Payment proof lets the router validate drift.
4. Reputation drops from evidence, not self-reporting.
5. Re-run avoids the caught agent.

## 8. Troubleshooting

### Server Offline

If the UI says the server is offline, the Trust Router page can fall back to mock behavior. The visual catch-and-reroute flow still works.

### Port Conflict

If port `3000` is busy, serve the UI on another port and update `WEB_BASE_URL` in Terminal 2.

Example:

```bash
npx serve -l 3002 apps/web
WEB_BASE_URL=http://localhost:3002 LOW_SPEND_SMOKE=true npm start
```

### Pera Signing Fails

Check:

- Pera is connected.
- Pera is set to TestNet.
- The wallet has TestNet ALGO.
- The signer page was opened from the returned `sign_url`.

### Low-Spend Boot Aborts

If `LOW_SPEND_SMOKE=true npm start` reports an underfunded wallet, either:

- top up the listed TestNet wallet, or
- continue with the main UI demo path.

### MCP Tool Not Found

Re-add the MCP server:

```bash
claude mcp add --transport http liminal http://localhost:3001/mcp
```

Then restart or refresh the Claude Code session if needed.

## 9. Known Boundaries

- Honest/Cheat discovery is curated for this demo.
- The main Trust Router UI is stage-friendly and does not perform the real Pera vendor payment from `Approve & pay`.
- The real no-custody Pera payment is available through the MCP signer path.
- Runtime payment and reputation state is in-memory plus ledger anchors.
- Full MCP tool-list parsing, A2A discovery, production persistence, and MainNet policy are deferred.
