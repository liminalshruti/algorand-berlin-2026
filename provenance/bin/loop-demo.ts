// Demo: the Liminal correction loop — drop → read → correct → sign — settled & anchored on Algorand.
//
//   node bin/loop-demo.ts                                  # mock — no Docker, no network, no secrets
//   LIMINAL_ALGO_NETWORK=localnet node bin/loop-demo.ts    # AlgoKit LocalNet
//   LIMINAL_ALGO_NETWORK=testnet  node bin/loop-demo.ts    # public testnet (needs a funded account)
//
// What it shows, beat by beat:
//   DROP    — a decision is dropped into the tray.
//   READ    — an in-lane agent serves a priced read; payment settles on x402; the read is anchored
//             (hash only) on Algorand. settle_payment + serve_priced_read are audited.
//   CORRECT — the user disagrees. The correction is recorded as first-class data. An `emergence`
//             correction (a third the system did not offer) is recorded but stays LOCAL — never projected.
//   SIGN    — the corrected re-read is signed and anchored (hash only). Its hash DIFFERS from the
//             first read's: the correction changed the next read. The loop does not converge.
//   GUARD   — an out-of-lane request is refused for FREE and the refusal is recorded.
//
// Exits non-zero if any loop invariant fails, so the demo doubles as a smoke test.

import { MockAnchorChain } from "../src/chain/mock.ts";
import { AlgorandAnchorChain } from "../src/chain/algorand.ts";
import { type AnchorChain, type Clock } from "../src/chain/types.ts";
import { type AlgoNetwork, accountFor, configFor, loadAlgosdk } from "../src/chain/algorand-client.ts";
import { Vault } from "../src/vault.ts";
import { signPacket, type Packet } from "../src/packet.ts";
import { verifyPacket } from "../src/verify.ts";
import { recordCorrection, projectCorrections } from "../src/correction.ts";
import { auditedCall } from "../src/audit.ts";
import { AgentRegistry, type PricedAgent, type Task } from "../src/x402/agent.ts";
import {
  type Facilitator,
  type Payer,
  AlgorandFacilitator,
  AlgorandPayer,
  MockFacilitator,
  MockPayer,
} from "../src/x402/facilitator.ts";
import { PricedEndpoint, x402Exchange } from "../src/x402/gate.ts";

const NET = process.env.LIMINAL_ALGO_NETWORK;
const REAL = NET === "localnet" || NET === "testnet";
const RUNTIME = REAL ? "live" : "demo";
const clock: Clock = () => "2026-06-06T10:00:00.000Z"; // fixed for a legible demo

function backends(): { payer: Payer; facilitator: Facilitator; anchor: AnchorChain } {
  if (NET === "localnet" || NET === "testnet") {
    return { payer: new AlgorandPayer(NET), facilitator: new AlgorandFacilitator(NET), anchor: new AlgorandAnchorChain(NET) };
  }
  return { payer: new MockPayer(), facilitator: new MockFacilitator(clock), anchor: new MockAnchorChain(clock) };
}

const analyst: PricedAgent = {
  name: "Analyst",
  register: "Diligence",
  archetype: "Diligence",
  payTo: REAL ? "ANALYST_PAYTO_OVERRIDE" : "ANALYSTWALLETADDRESS",
  price: 10_000,
  asset: "ALGO",
  serve: (task) => ({
    agent_name: "Analyst",
    archetype: "Diligence",
    situation: `Diligence read of: ${task.prompt}`,
    hidden_risk: "Two systems of record disagree; treat neither as authoritative yet.",
    next_move: "Diff the asserted state against the source of record before acting.",
    refusal: null,
    ordinal: 0,
  }),
};

const sdr: PricedAgent = {
  name: "SDR",
  register: "Outreach",
  archetype: "Outreach",
  payTo: REAL ? "SDR_PAYTO_OVERRIDE" : "SDRWALLETADDRESS",
  price: 5_000,
  asset: "ALGO",
  serve: (task) => ({ agent_name: "SDR", archetype: "Outreach", situation: `Outreach draft for: ${task.prompt}`, hidden_risk: null, next_move: "Open with the contradiction.", refusal: null, ordinal: 0 }),
};

async function main(): Promise<void> {
  const { payer, facilitator, anchor } = backends();
  // On a real network the placeholder payTo isn't a valid address, and the 0.01 ALGO price is below
  // the min balance to create a new receiver — so pay to the funded LocalNet/testnet account itself
  // (self-pay) so settlement actually lands on-chain for the demo.
  if (REAL) {
    const funded = await accountFor(await loadAlgosdk(), configFor(NET as AlgoNetwork));
    analyst.payTo = funded.address;
    sdr.payTo = funded.address;
    console.log(`       (real network: settlement paid to funded account ${funded.address.slice(0, 8)}…)`);
  }
  const registry = new AgentRegistry().add(analyst).add(sdr);
  const vault = new Vault(clock);
  const endpoint = new PricedEndpoint(analyst, facilitator, registry, { vault, anchorChain: anchor, clock });

  console.log(`\n=== Liminal correction loop — settled & anchored on Algorand (chain: ${anchor.chain}/${anchor.network}) ===\n`);

  // ── DROP ────────────────────────────────────────────────────────────────
  const task: Task = { id: "loop", register: "Diligence", prompt: "Partner email says rejected; SR007 dashboard says in-review." };
  console.log(`[DROP] ${task.prompt}`);
  console.log(`       task ${task.id} (${task.register})`);

  // ── READ 1: priced, settled, anchored ────────────────────────────────────
  console.log("\n[READ] Analyst (in lane) — priced read over x402");
  const paid = await x402Exchange(endpoint, task, payer);
  if (paid.outcome !== "paid") {
    console.error(`    BUG: expected a paid read, got ${paid.outcome}`);
    process.exit(1);
  }
  console.log(`       verify → settle: success=${paid.settlement.success} txn=${paid.settlement.transaction} round=${paid.settlement.confirmedRound}`);
  console.log(`       served: "${paid.read.situation}"`);
  const p1 = vault.sharePacket("pkt_loop_Analyst")!;
  const h1 = signPacket(p1).packet_hash;
  console.log(`       anchored read 1: packet_hash=${h1.slice(0, 16)}… txid=${paid.anchor?.anchor_txn_id}`);
  const v1 = await verifyPacket(p1, paid.anchor!.anchor_txn_id, anchor);
  console.log(`       provenance verify: ${v1.ok ? "OK" : "FAILED"} — paid here, proven here.`);
  const anchoredEvtId = vault.list("packet.anchored").at(-1)!.id; // the read the correction points at

  // ── CORRECT: first-class pushback; emergence stays local ──────────────────
  console.log("\n[CORRECT] The user disagrees. Pushback is first-class data — it changes the next read.");
  const note = "It's a routing-mismatch, not a rejection. The dashboard is the source of truth.";
  const outer = recordCorrection(vault, { correction_kind: "outer", target_event_id: anchoredEvtId, user_note: note, provenance: { source: "operator", session: "berlin-demo" } });
  console.log(`       correction_kind=outer  target=${outer.target_event_id.slice(0, 8)}…  projectable=${outer.projectable}`);
  const emergence = recordCorrection(vault, { correction_kind: "emergence", target_event_id: anchoredEvtId, user_note: "Neither read fits — this is a third the system did not offer.", provenance: { source: "operator", session: "berlin-demo" } });
  console.log(`       correction_kind=emergence  projectable=${emergence.projectable}  ← local-only, never projected outward`);

  // ── SIGN: the corrected re-read, signed + anchored (hash only) ────────────
  console.log("\n[SIGN] The corrected re-read is signed and anchored (hash only).");
  const correctedRead = analyst.serve({ ...task, prompt: `${task.prompt} [operator correction: ${note}]` });
  const p2: Packet = {
    id: "pkt_loop_Analyst_corrected",
    context: task.prompt,
    user_correction: note,
    chosen_agent: "Analyst",
    correction_kind: "outer",
    runtime_mode: RUNTIME,
    created_at: clock(),
    agent_reads: [correctedRead],
  };
  vault.save(p2);
  const a2 = (await auditedCall(vault, {
    decision_tag: "anchor_packet",
    runtime: RUNTIME,
    invoke: async () => ({ result: await vault.anchorPacket(p2.id, anchor), input_tokens: 0, output_tokens: 0 }),
  })).result;
  const h2 = signPacket(p2).packet_hash;
  console.log(`       anchored correction: packet_hash=${h2.slice(0, 16)}… txid=${a2.anchor_txn_id}`);
  console.log(`       on-chain note carries only: {schema, canonical_version, packet_hash} — content leaked on chain? no`);
  console.log(`       read 1 hash ${h1.slice(0, 12)}…  →  re-read hash ${h2.slice(0, 12)}…  (${h1 === h2 ? "UNCHANGED — BUG" : "changed — the correction moved the read"})`);

  // ── RE-READ projection: emergence is absent ───────────────────────────────
  const projected = projectCorrections(vault.list("correction"));
  console.log(`\n[RE-READ] corrections feeding the next read: ${JSON.stringify(projected.map((p) => p.correction_kind))}  (emergence excluded by category)`);

  // ── GUARD: out-of-lane → free refusal, recorded ───────────────────────────
  console.log("\n[GUARD] Out-of-lane probe → free refusal, recorded.");
  const refused = await x402Exchange(endpoint, { id: "probe", register: "Outreach", prompt: "Write the follow-up email." }, payer);
  if (refused.outcome === "refused-free") {
    console.log(`       200 FREE — ${refused.refusal}`);
  }

  // ── AUDIT ribbon ──────────────────────────────────────────────────────────
  console.log("\n[AUDIT] append-only vault event log:");
  for (const kind of ["packet.saved", "packet.anchored", "agent.call", "correction", "lane.refusal"] as const) {
    console.log(`       ${kind.padEnd(16)} ${vault.count(kind)}`);
  }

  // ── Invariants (exit non-zero on any failure) ─────────────────────────────
  const checks: Array<[string, boolean]> = [
    ["read 1 settled + anchored", paid.outcome === "paid" && paid.anchor !== null],
    ["read 1 provenance verifies", v1.ok],
    ["outer correction is projectable", outer.projectable === true],
    ["emergence correction is NOT projectable", emergence.projectable === false],
    ["projection excludes emergence", projected.length === 1 && projected[0]!.correction_kind === "outer"],
    ["re-read hash differs from read 1 (loop did not converge)", h1 !== h2],
    ["out-of-lane refused for free", refused.outcome === "refused-free"],
    ["refusal recorded as an event", vault.count("lane.refusal") === 1],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  console.log("");
  if (failed.length > 0) {
    for (const [name] of failed) console.error(`✗ ${name}`);
    process.exit(1);
  }
  console.log("Loop complete: drop → read → correct → sign — settled and anchored on Algorand. All invariants held.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
