/**
 * Router MCP server — gives a Claude agent WALLET ACCESS + x402 payment tools
 * over the x402 Trust Router. This is the "agent with our router MCP server
 * installed" that pays algos and earns/loses agents their reputation.
 *
 * x402 is used end-to-end:
 *   1. request_x402_challenge -> the router forwards the SELECTED agent's x402
 *      execution requirement (HTTP 402 `accepts`: scheme exact, network, asset,
 *      amount, payTo, nonce, resource).
 *   2. pay_x402 -> the agent signs + sends a real Algorand "exact" settlement
 *      from ITS OWN wallet to the agent's pay_to (the note binds the challenge),
 *      then re-calls the provider's MCP endpoint with an `X-PAYMENT` header to
 *      receive the paid deliverable (the x402 settle-then-deliver handshake),
 *      then submits the txid to the router which verifies the payment on-chain
 *      (indexer) and lowers reputation on quote drift.
 *   3. give_feedback -> payment-backed user review via a 0-ALGO payer self-auth.
 *
 * pay_x402 / give_feedback are IDEMPOTENT + POLLABLE: a fresh TestNet txn can lag
 * the indexer the router reads. Each call waits a bounded window; if the indexer
 * is still catching up it returns `*_status: "pending_indexer"` (NOT an error) so
 * it stays under the MCP client's request timeout. Call the same tool again with
 * the same challenge_id to resume — it will not re-pay.
 *
 * Run:   ROUTER_URL=http://localhost:3001 tsx apps/router/bin/router-mcp-server.ts
 * Wallet: MCP_CLIENT_MNEMONIC (falls back to PAYER_MNEMONIC from .env.demo).
 *
 * Talks to the router over HTTP and to providers over x402; it never imports
 * router internals, so it stays decoupled from the frozen contract surface.
 */
import "../src/load-env.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AlgorandClient, Config, algo } from "@algorandfoundation/algokit-utils";

// stdio MCP owns stdout for JSON-RPC; algokit logs to stdout by default, so
// route every algokit log line to stderr to avoid corrupting the protocol.
const toStderr = (...a: unknown[]) => console.error(...a);
Config.configure({
  logger: {
    error: toStderr,
    warn: toStderr,
    info: toStderr,
    verbose: toStderr,
    debug: toStderr,
  },
});

const ROUTER_URL = (process.env.ROUTER_URL ?? "http://localhost:3001").replace(/\/$/, "");
const NETWORK = (process.env.ALGO_NETWORK ?? "testnet").trim();
const MNEMONIC = (
  process.env.MCP_CLIENT_MNEMONIC ??
  process.env.CLIENT_MNEMONIC ??
  process.env.PAYER_MNEMONIC ??
  ""
).trim();
const MICROALGO = 1_000_000;

// Bounded inline wait for the TestNet indexer to catch up to a fresh txn. Kept
// under the typical 60s MCP client request timeout; pay_x402 / give_feedback are
// pollable, so the agent just calls again if they return "pending_indexer".
const INDEXER_ATTEMPTS = Number(process.env.MCP_INDEXER_RETRIES ?? 14);
const INDEXER_DELAY_MS = Number(process.env.MCP_INDEXER_DELAY_MS ?? 3500);

if (!MNEMONIC) {
  console.error(
    "FATAL: no wallet mnemonic. Set MCP_CLIENT_MNEMONIC (or load .env.demo for PAYER_MNEMONIC).",
  );
  process.exit(1);
}

function algorandClient(): AlgorandClient {
  if (NETWORK === "localnet") return AlgorandClient.defaultLocalNet();
  if (NETWORK === "mainnet") return AlgorandClient.mainNet();
  return AlgorandClient.testNet();
}

const algorand = algorandClient();
const account = algorand.account.fromMnemonic(MNEMONIC);
const ADDRESS = account.addr.toString();

const enc = (s: string) => new TextEncoder().encode(s);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitSecondsLabel = Math.round((INDEXER_ATTEMPTS * INDEXER_DELAY_MS) / 1000);

function explorer(txid: string): string {
  const net = NETWORK === "mainnet" ? "mainnet" : NETWORK === "localnet" ? "localnet" : "testnet";
  return `https://lora.algokit.io/${net}/transaction/${txid}`;
}

// --- router HTTP helpers ----------------------------------------------------
async function routerGet(path: string): Promise<any> {
  const res = await fetch(`${ROUTER_URL}${path}`);
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(json?.error ?? `GET ${path} -> ${res.status}`);
  return json;
}

async function routerPost(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${ROUTER_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(json?.error ?? `POST ${path} -> ${res.status}`);
  return json;
}

type Bounded<T> = { ok: true; value: T } | { ok: false; error: string };

// Retry a router call that depends on the indexer catching up to a fresh txn.
// Returns ok:false (not throw) when the bound is hit on a known "not seen yet"
// error, so callers can return a pollable "pending_indexer" result. Any other
// error throws immediately (it's a real failure to surface).
async function tryIndexerBound<T>(fn: () => Promise<T>, label: string): Promise<Bounded<T>> {
  let lastErr = "";
  for (let attempt = 1; attempt <= INDEXER_ATTEMPTS; attempt++) {
    try {
      return { ok: true, value: await fn() };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/unknown payment txid|not confirmed|unknown auth txid/i.test(msg)) {
        lastErr = msg;
        console.error(`${label}: indexer lag (attempt ${attempt}/${INDEXER_ATTEMPTS}): ${msg}`);
        if (attempt < INDEXER_ATTEMPTS) await sleep(INDEXER_DELAY_MS);
        continue;
      }
      throw e;
    }
  }
  return { ok: false, error: lastErr };
}

// --- wallet helpers ---------------------------------------------------------
async function balanceAlgo(): Promise<number> {
  const info: any = await algorand.client.algod.accountInformation(account.addr).do();
  return Number(info.amount ?? 0) / MICROALGO;
}

async function sendPayment(to: string, amountAlgo: number, note: string): Promise<string> {
  const res: any = await algorand.send.payment({
    sender: account.addr,
    receiver: to,
    amount: algo(amountAlgo),
    note: enc(note),
  });
  return res?.txIds?.[0] ?? res?.txId ?? "";
}

// --- x402 challenge cache (so pay_x402 / give_feedback work by id) -----------
type CachedChallenge = {
  challenge_id: string;
  agent_id: string;
  service_id: string;
  quote_id: string;
  amount: number;
  asset: string;
  pay_to: string;
  network: string;
  nonce: string;
  resource: string;
  payment_note: string;
  quote_amount: number;
  quote_drift: boolean;
  payment_txid?: string;
  delivery?: unknown;
  proven?: boolean;
  feedback?: { intent_id: string; auth_txid: string; response: number };
};
const challenges = new Map<string, CachedChallenge>();

// Build a real x402 `X-PAYMENT` header payload (base64 JSON) for the provider.
function xPaymentHeader(ch: CachedChallenge, txid: string): string {
  const payload = {
    x402Version: 1,
    scheme: "exact",
    network: ch.network,
    payload: {
      txid,
      payer: ADDRESS,
      payTo: ch.pay_to,
      amount: ch.amount,
      asset: ch.asset,
      nonce: ch.nonce,
      resource: ch.resource,
      note: ch.payment_note,
    },
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

async function deliverOverX402(ch: CachedChallenge, txid: string): Promise<unknown> {
  try {
    const res = await fetch(ch.resource, {
      method: "POST",
      headers: { "content-type": "application/json", "X-PAYMENT": xPaymentHeader(ch, txid) },
      body: JSON.stringify({ mode: "execute" }),
    });
    const body = await res.json().catch(() => ({}));
    return { http_status: res.status, ...(body as object) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// --- tools ------------------------------------------------------------------
const TOOLS = [
  {
    name: "wallet_info",
    description:
      "Show this agent's Algorand wallet: address, network, ALGO balance, and the router URL it pays through. Call first to confirm wallet access.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "discover_services",
    description:
      "List the router's tool catalog: grouped services and the ranked candidate agents for each, with reputation, price (active quote amount/asset), and pay_to. Use this to see the marketplace before routing.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "route_task",
    description:
      "Ask the router to rank agents for a task. Returns a route_id and ranked options (option_id, agent_id, price, reputation, trust_score, pay_to). options[0] is the router's pick by price + earned reputation.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Natural-language task, e.g. 'diligence report on a counterparty'." },
        service_id: { type: "string", description: "Optional service id to target (default: the diligence service)." },
      },
      required: ["task"],
      additionalProperties: false,
    },
  },
  {
    name: "request_x402_challenge",
    description:
      "For a chosen route option, get the selected agent's x402 EXECUTION requirement (the HTTP 402: amount, asset, pay_to, network, nonce, resource, payment_note) plus the original quote and a quote_drift flag (true = the agent now asks more than it quoted). Returns a challenge_id to pay.",
    inputSchema: {
      type: "object",
      properties: { route_id: { type: "string" }, option_id: { type: "string" } },
      required: ["route_id", "option_id"],
      additionalProperties: false,
    },
  },
  {
    name: "pay_x402",
    description:
      "Pay an x402 challenge from this agent's wallet: (1) sign + send a real Algorand 'exact' settlement to the agent's pay_to with the binding note, (2) re-call the provider's MCP endpoint with an X-PAYMENT header to receive the paid deliverable, (3) submit the txid to the router, which verifies it on-chain and lowers reputation if the charge drifted above the quote. IDEMPOTENT + POLLABLE: if it returns proof_status='pending_indexer', the payment is already on-chain (see explorer) — just call pay_x402 again with the same challenge_id to finalize the proof + reputation (it will NOT re-pay).",
    inputSchema: {
      type: "object",
      properties: { challenge_id: { type: "string", description: "From request_x402_challenge." } },
      required: ["challenge_id"],
      additionalProperties: false,
    },
  },
  {
    name: "give_feedback",
    description:
      "Leave payment-backed user feedback (0..100) for a challenge already finalized via pay_x402. Signs a 0-ALGO payer self-auth tx that proves wallet control, then records the review through the router (ReputationRegistry giveFeedback / hash anchor). IDEMPOTENT + POLLABLE: if it returns feedback_status='pending_indexer', call give_feedback again with the same challenge_id to finalize (it will NOT re-send the auth tx).",
    inputSchema: {
      type: "object",
      properties: {
        challenge_id: { type: "string" },
        response: { type: "integer", minimum: 0, maximum: 100, description: "Satisfaction score, 0..100." },
        comment: { type: "string", description: "Optional human note (not sent on-chain)." },
      },
      required: ["challenge_id", "response"],
      additionalProperties: false,
    },
  },
  {
    name: "get_reputation",
    description:
      "Read an agent's current router reputation: score, reads/corrections logged, and per-tag breakdown. Use to confirm a reputation drop after quote drift, then re-run route_task to see the router reroute.",
    inputSchema: {
      type: "object",
      properties: { agent_id: { type: "string", description: "The agent_id from a route option or challenge." } },
      required: ["agent_id"],
      additionalProperties: false,
    },
  },
];

async function handleTool(name: string, args: Record<string, any>): Promise<unknown> {
  switch (name) {
    case "wallet_info": {
      const balance_algo = await balanceAlgo();
      return { address: ADDRESS, network: NETWORK, balance_algo, router_url: ROUTER_URL };
    }

    case "discover_services": {
      const cat = await routerGet("/api/services");
      const summary = (cat.services ?? []).map((s: any) => ({
        service_id: s.service_id,
        name: s.name,
        options: (s.options ?? []).map((o: any) => ({
          agent_id: o.agent_id,
          registry_agent_id: o.registry_agent_id,
          name: o.agent?.name,
          price: o.quote?.amount,
          asset: o.quote?.asset,
          pay_to: o.quote?.pay_to,
          reputation: o.trust?.reputation,
          endpoint: o.capability?.endpoint,
        })),
      }));
      return { network: cat.network, generated_at: cat.generated_at, services: summary };
    }

    case "route_task": {
      const body: Record<string, unknown> = { task: String(args.task ?? "") };
      if (args.service_id) body.service_id = String(args.service_id);
      const r = await routerPost("/api/route", body);
      return {
        route_id: r.route_id,
        task: r.task,
        service_id: r.service_id,
        options: r.options,
        hint: "Pick an option_id, then call request_x402_challenge(route_id, option_id). options[0] is the router's top pick.",
      };
    }

    case "request_x402_challenge": {
      const r = await routerPost("/api/challenge", {
        route_id: String(args.route_id ?? ""),
        option_id: String(args.option_id ?? ""),
      });
      const ch: CachedChallenge = {
        challenge_id: r.challenge_id,
        agent_id: r.agent_id,
        service_id: r.service_id,
        quote_id: r.quote_id,
        amount: r.amount,
        asset: r.asset,
        pay_to: r.pay_to,
        network: r.network,
        nonce: r.nonce,
        resource: r.resource,
        payment_note: r.payment_note,
        quote_amount: r.quote?.amount,
        quote_drift: Boolean(r.quote_drift),
      };
      challenges.set(ch.challenge_id, ch);
      return {
        ...r,
        note: `x402 challenge: pay ${r.amount} ${r.asset} to ${r.pay_to}. Quote was ${r.quote?.amount} ${r.asset}${
          r.quote_drift ? " — DRIFT: agent now charges MORE than it quoted." : " — matches the quote."
        } Call pay_x402("${r.challenge_id}").`,
      };
    }

    case "pay_x402": {
      const ch = challenges.get(String(args.challenge_id ?? ""));
      if (!ch) throw new Error("unknown challenge_id; call request_x402_challenge first");

      // 1) x402 exact settlement on-chain (once), from this agent's own wallet,
      // 2) x402 delivery: re-call the provider WITH the X-PAYMENT header (once).
      if (!ch.payment_txid) {
        const txid = await sendPayment(ch.pay_to, ch.amount, ch.payment_note);
        ch.payment_txid = txid;
        ch.delivery = await deliverOverX402(ch, txid);
      }

      // 3) submit proof to the router (verifies on-chain; drops rep on drift).
      const attempt = await tryIndexerBound(
        () => routerPost("/api/payment-proof", { challenge_id: ch.challenge_id, txid: ch.payment_txid, payer: ADDRESS }),
        "payment-proof",
      );

      const common = {
        x402: { scheme: "exact", network: ch.network, asset: ch.asset, pay_to: ch.pay_to },
        settle_txid: ch.payment_txid,
        explorer: explorer(ch.payment_txid!),
        quote_amount: ch.quote_amount,
        settled_amount: ch.amount,
        quote_drift: ch.quote_drift,
        x402_delivery: ch.delivery,
        agent_id: ch.agent_id,
      };

      if (!attempt.ok) {
        return {
          paid: true,
          proof_status: "pending_indexer",
          ...common,
          message: `Payment is on-chain (see explorer), but the TestNet indexer hasn't surfaced it after ~${waitSecondsLabel}s. Call pay_x402("${ch.challenge_id}") again to finalize the proof + reputation (it will NOT re-pay).`,
        };
      }

      ch.proven = true;
      return {
        paid: true,
        proof_status: "confirmed",
        ...common,
        proof_result: attempt.value,
        new_reputation: attempt.value?.new_reputation,
        next: "Optionally give_feedback(challenge_id, 0..100). Then get_reputation(agent_id) and re-run route_task to see the reroute.",
      };
    }

    case "give_feedback": {
      const ch = challenges.get(String(args.challenge_id ?? ""));
      if (!ch) throw new Error("unknown challenge_id; call request_x402_challenge first");
      if (!ch.payment_txid || !ch.proven) {
        throw new Error("finalize pay_x402 first — feedback must be backed by a confirmed payment (proof_status='confirmed')");
      }
      const response = Math.trunc(Number(args.response));
      if (!Number.isFinite(response) || response < 0 || response > 100) {
        throw new Error("response must be an integer 0..100");
      }

      // Create the feedback intent + sign the 0-ALGO self-auth tx ONCE; cache so
      // a pollable re-call reuses them instead of paying again.
      if (!ch.feedback) {
        const intent = await routerPost("/api/feedback/intent", {
          challenge_id: ch.challenge_id,
          payment_txid: ch.payment_txid,
          payer: ADDRESS,
          response,
        });
        const auth_txid = await sendPayment(ADDRESS, 0, intent.note);
        ch.feedback = { intent_id: intent.feedback_intent_id, auth_txid, response };
      }

      // Submit the authorized feedback (waits for the auth tx to be indexed).
      const attempt = await tryIndexerBound(
        () => routerPost("/api/feedback", { feedback_intent_id: ch.feedback!.intent_id, auth_txid: ch.feedback!.auth_txid }),
        "feedback",
      );

      if (!attempt.ok) {
        return {
          accepted: false,
          feedback_status: "pending_indexer",
          agent_id: ch.agent_id,
          response: ch.feedback.response,
          auth_txid: ch.feedback.auth_txid,
          auth_explorer: explorer(ch.feedback.auth_txid),
          message: `Auth tx is on-chain but the indexer hasn't surfaced it after ~${waitSecondsLabel}s. Call give_feedback("${ch.challenge_id}", ${ch.feedback.response}) again to finalize (it will NOT re-send the auth tx).`,
        };
      }

      const fb = attempt.value;
      return {
        accepted: fb.accepted,
        feedback_status: "confirmed",
        agent_id: ch.agent_id,
        response: ch.feedback.response,
        comment: args.comment ?? null,
        auth_txid: ch.feedback.auth_txid,
        auth_explorer: explorer(ch.feedback.auth_txid),
        new_reputation: fb.new_reputation,
        reputation_txid: fb.reputation_txid ?? null,
        reputation_explorer: fb.reputation_txid ? explorer(fb.reputation_txid) : null,
        ledger_txid: fb.ledger_txid ?? null,
        rebate_txid: fb.rebate_txid ?? null,
      };
    }

    case "get_reputation": {
      const agent = encodeURIComponent(String(args.agent_id ?? ""));
      return await routerGet(`/api/reputation?agent=${agent}`);
    }

    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

async function main(): Promise<void> {
  const server = new Server(
    { name: "x402-trust-router", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, any>;
    try {
      const result = await handleTool(name, args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: "text", text: `Error in ${name}: ${msg}` }], isError: true };
    }
  });

  await server.connect(new StdioServerTransport());
  console.error(
    `x402 trust-router MCP server ready | wallet=${ADDRESS} | network=${NETWORK} | router=${ROUTER_URL}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
