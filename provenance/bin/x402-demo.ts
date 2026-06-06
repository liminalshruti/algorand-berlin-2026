// Demo: agent-to-agent x402 settlement with a structural refusal guard (Berlin AlgoHack).
//
//   node bin/x402-demo.ts                                  # mock — no Docker, no network, no secrets
//   LIMINAL_ALGO_NETWORK=localnet node bin/x402-demo.ts    # AlgoKit LocalNet
//   LIMINAL_ALGO_NETWORK=testnet  node bin/x402-demo.ts    # public testnet (needs a funded account)
//
// Protocol shaped to the official Algorand reference (algorandfoundation/x402-demo): scheme "exact",
// CAIP-2 networks, client-signs / facilitator-submits, verify→settle. Three scenarios:
//   A. In-lane paid call → verify → settle on Algorand → delivered read anchored via provenance.
//   B. Out-of-lane call → refused for FREE, names the right agent, NO settlement (commerce guard).
//   C. Underpayment → settlement rejected, no read served.

import { MockAnchorChain } from "../src/chain/mock.ts";
import { AlgorandAnchorChain } from "../src/chain/algorand.ts";
import { type AnchorChain, type Clock } from "../src/chain/types.ts";
import { type AlgoNetwork, accountFor, configFor, loadAlgosdk } from "../src/chain/algorand-client.ts";
import { Vault } from "../src/vault.ts";
import { verifyPacket } from "../src/verify.ts";
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
const clock: Clock = () => "2026-06-06T10:00:00.000Z"; // fixed for a legible demo

function backends(): { payer: Payer; facilitator: Facilitator; anchor: AnchorChain } {
  if (NET === "localnet" || NET === "testnet") {
    return { payer: new AlgorandPayer(NET), facilitator: new AlgorandFacilitator(NET), anchor: new AlgorandAnchorChain(NET) };
  }
  return { payer: new MockPayer(), facilitator: new MockFacilitator(clock), anchor: new MockAnchorChain(clock) };
}

// Two bounded agents in different registers (mirrors liminal-agents).
const analyst: PricedAgent = {
  name: "Analyst",
  register: "Diligence",
  archetype: "Diligence",
  payTo: REAL ? "ANALYST_PAYTO_OVERRIDE" : "ANALYSTWALLETADDRESS",
  price: 10_000, // 0.01 ALGO (smallest units)
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
  serve: (task) => ({
    agent_name: "SDR",
    archetype: "Outreach",
    situation: `Outreach draft for: ${task.prompt}`,
    hidden_risk: null,
    next_move: "Open with the contradiction, ask one clarifying question.",
    refusal: null,
    ordinal: 0,
  }),
};

async function main(): Promise<void> {
  const { payer, facilitator, anchor } = backends();
  // On a real network the placeholder payTo isn't a valid address (and 0.01 ALGO is below the min
  // balance to create a new receiver) — pay to the funded LocalNet/testnet account itself for the demo.
  if (REAL) {
    const funded = await accountFor(await loadAlgosdk(), configFor(NET as AlgoNetwork));
    analyst.payTo = funded.address;
    sdr.payTo = funded.address;
    console.log(`    (real network: settlement paid to funded account ${funded.address.slice(0, 8)}…)`);
  }
  const registry = new AgentRegistry().add(analyst).add(sdr);
  const vault = new Vault();
  const analystEndpoint = new PricedEndpoint(analyst, facilitator, registry, { vault, anchorChain: anchor, clock });

  console.log(`\n=== x402 agent commerce demo — facilitator network: ${facilitator.network} ===\n`);

  // ── A. In-lane paid call ────────────────────────────────────────────────
  const diligenceTask: Task = { id: "t1", register: "Diligence", prompt: "Partner email contradicts the dashboard." };
  console.log("[A] Diligence task → Analyst (in lane)");
  const challenge = await analystEndpoint.serve(diligenceTask);
  if (challenge.outcome === "payment-required") {
    console.log(`    402 PAYMENT-REQUIRED → pay ${challenge.requirements.amount} of ${challenge.requirements.asset} to ${challenge.requirements.payTo}`);
    console.log(`         scheme=${challenge.requirements.scheme} network=${challenge.requirements.network}`);
    console.log(`         resource=${challenge.requirements.resource} nonce=${challenge.requirements.nonce}`);
  }
  const paid = await x402Exchange(analystEndpoint, diligenceTask, payer);
  if (paid.outcome === "paid") {
    console.log(`    verify → settle: success=${paid.settlement.success} txn=${paid.settlement.transaction} round=${paid.settlement.confirmedRound}`);
    console.log(`    served:  "${paid.read.situation}"`);
    if (paid.anchor) {
      console.log(`    anchored: packet_hash=${paid.anchor.packet_hash.slice(0, 16)}… txid=${paid.anchor.anchor_txn_id}`);
      const shared = vault.sharePacket(`pkt_${diligenceTask.id}_Analyst`)!;
      const v = await verifyPacket(shared, paid.anchor.anchor_txn_id, anchor);
      console.log(`    provenance verify: ${v.ok ? "OK" : "FAILED"} — paid here, proven here.`);
    }
  }

  // ── B. Out-of-lane call → free refusal, no settlement ───────────────────
  const outreachTask: Task = { id: "t2", register: "Outreach", prompt: "Write the follow-up email." };
  console.log("\n[B] Outreach task → Analyst (OUT of lane)");
  const refused = await x402Exchange(analystEndpoint, outreachTask, payer);
  if (refused.outcome === "refused-free") {
    console.log(`    200 FREE — ${refused.refusal}`);
    console.log(`    no settlement occurred. Commerce guard held: no charge for out-of-lane work.`);
  } else {
    console.log("    BUG: expected a free refusal");
  }

  // ── C. Underpayment → rejected ──────────────────────────────────────────
  console.log("\n[C] Underpayment attempt → Analyst");
  const c = await analystEndpoint.serve(diligenceTask); // fresh challenge (id t1 again)
  if (c.outcome === "payment-required") {
    const underPayment = await payer.createPayment({ ...c.requirements, amount: 1 }); // sign for 1 unit
    const rejected = await analystEndpoint.serve(diligenceTask, underPayment);
    console.log(`    result: ${rejected.outcome}${rejected.outcome === "payment-invalid" ? ` — ${rejected.reason}` : ""}`);
  }

  console.log("");
  if (!(paid.outcome === "paid" && refused.outcome === "refused-free")) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
