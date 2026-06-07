---
name: x402-demo
description: Run the live x402 Trust Router end-to-end demo. Use when the user types /x402-demo or asks to "run the demo", "demo the trust router", or "show the x402 / agent reputation flow". Drives the demo by acting as the paying agent through the x402-trust-router MCP tools: discover, route to the cheapest agent, hit quote drift, settle on-chain via x402, watch reputation drop, reroute to the honest agent, and leave payment-backed feedback.
allowed-tools: Bash, mcp__x402-trust-router__wallet_info, mcp__x402-trust-router__discover_services, mcp__x402-trust-router__route_task, mcp__x402-trust-router__request_x402_challenge, mcp__x402-trust-router__pay_x402, mcp__x402-trust-router__give_feedback, mcp__x402-trust-router__get_reputation
---

# x402 Trust Router — live end-to-end demo

You are the **paying AI agent**. You hold an Algorand TestNet wallet and pay other
agents over x402 through our Trust Router. Drive this demo live for an audience:
narrate each beat in one short line, then run the tool and surface the key numbers.
This spends a small amount of real TestNet ALGO — that is expected and is the point.

## The story you are telling
"ERC-8004 gives agents a passport; we give the marketplace a conscience." The router
ranks agents by price + earned reputation. The cheapest agent (Cheat) quietly charges
above its quote; on-chain proof catches the drift, its reputation drops, and the next
identical request reroutes to the honest agent — no human review.

## Step 0 — Preflight the stack (do this silently, only report problems)

The MCP server talks to the router on `:3001`, which talks to the local agents on `:4021`.

1. Check the router: `curl -s -m 4 -o /dev/null -w '%{http_code}' http://localhost:3001/api/services`
2. Check the agents: `curl -s -m 4 -o /dev/null -w '%{http_code}' http://localhost:4021/honest/mcp`
3. If either is NOT reachable, start them in tmux and wait for readiness:
   - `tmux new -d -s x402 'npm run agents:local |& tee /tmp/agents.log' 2>/dev/null || true`
   - `tmux new-window -t x402 'LOW_SPEND_SMOKE=true npm start |& tee /tmp/router.log' 2>/dev/null || true`
   - Poll `/tmp/router.log` (Bash, short loop) until it prints `router-server :3001`.
   - If the router log shows a funding/balance/connection error instead, STOP and tell the
     user: the box can't reach Algorand TestNet, or the demo payer
     `24E3VEEJYQZAEZ6YQEVNVMP2A5R4HLSSOL6WKPBKBYLBJF4KE7D577V4XI` needs TestNet funds.
4. Do not narrate Step 0 unless something is wrong — the audience starts at Step 1.

## The demo spine — use the MCP tools, not curl

Run these in order. After each, print only what the audience needs.

1. **`wallet_info`** — "Here's my agent wallet." Show address, network, ALGO balance.
2. **`discover_services`** — "The router's tool catalog." Show the candidate agents with
   their price + reputation. Point out the cheapest one wins on price alone, for now.
3. **`route_task`** with `task: "diligence report on an acquisition counterparty"`.
   Keep the returned `route_id`. options[0] is the router's pick — name it and note it's
   the cheap one. Keep its `option_id`.
4. **`request_x402_challenge`** with that `route_id` + `option_id`. Read the result aloud:
   the agent's x402 execution requirement (amount / asset / pay_to). **Call out the
   `quote_drift: true`** — "it quoted 0.04 but now demands 0.06 ALGO." Keep `challenge_id`.
5. **`pay_x402`** with that `challenge_id`. This signs + sends a real Algorand `exact`
   settlement, gets the deliverable over x402, and submits the proof on-chain.
   - If it returns `proof_status: "pending_indexer"`, that is NOT an error — the payment
     is already on-chain (show the explorer link). Just call `pay_x402` again with the
     **same** `challenge_id` to finalize; it will NOT re-pay. Repeat until `confirmed`.
   - On `confirmed`: show `settle_txid`, the `explorer` link, settled vs quote amount, and
     `new_reputation` for the cheat. "Proof of overcharge → reputation written down."
6. **`get_reputation`** for the cheat's `agent_id` (from the challenge). Show it has dropped.
7. **`route_task`** again, **same task**. "Same request, no human in the loop." Show that
   options[0] is now the **honest** agent — the router rerouted around the cheat.
8. **`request_x402_challenge`** + **`pay_x402`** for the honest option. Show `quote_drift`
   is false and it settles at quote. (Same pending_indexer polling rule applies.)
9. **`give_feedback`** for the honest challenge with `response: 100`,
   `comment: "accurate, on-quote"`. This signs a 0-ALGO self-auth proving wallet control,
   then records payment-backed feedback. Show `accepted: true` and the `auth_txid`.
10. **`get_reputation`** for the honest agent — show the bump.

## Close (one short summary)

Recap with the real artifacts: the two settle txids + explorer links, the cheat's
reputation before/after, the reroute decision, and the honest agent's feedback-backed
score. Land the line: reputation here is **earned and verified on-chain**, not self-reported.

## Rules
- Prefer the `mcp__x402-trust-router__*` tools for the spine; use Bash only for Step 0.
- Never fabricate a txid, balance, or reputation — only report values the tools return.
- Keep narration tight: this is a live demo, one or two lines per beat.
- If a chain step genuinely fails (not pending_indexer), stop and show the error plainly.
