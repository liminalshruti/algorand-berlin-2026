// Demo: sign packet → anchor packet → verify packet (Berlin AlgoHack OKR).
//
//   node bin/demo.ts                          # mock chain — no Docker, no network, no secrets
//   LIMINAL_ALGO_NETWORK=localnet node bin/demo.ts   # AlgoKit LocalNet (algokit localnet start)
//   LIMINAL_ALGO_NETWORK=testnet  node bin/demo.ts   # public testnet (needs a funded account)
//
// It prints the exact bytes published on chain so you can SEE that only the hash leaves — the
// founder's context, correction, and the agents' reads never appear in the note.

import { type AnchorChain } from "../src/chain/types.ts";
import { MockAnchorChain } from "../src/chain/mock.ts";
import { AlgorandAnchorChain, type AlgoNetwork } from "../src/chain/algorand.ts";
import { type Packet } from "../src/packet.ts";
import { Vault } from "../src/vault.ts";
import { verifyPacket } from "../src/verify.ts";

function pickChain(): AnchorChain {
  const net = process.env.LIMINAL_ALGO_NETWORK;
  if (net === "localnet" || net === "testnet") {
    return new AlgorandAnchorChain(net as AlgoNetwork);
  }
  return new MockAnchorChain();
}

// A real founder-grade deliberation packet — the May 8 SR007 routing-mismatch scenario, shaped to
// the desktop `packets` + `agent_reads` schema. The content below is exactly what must NEVER reach
// the chain.
const packet: Packet = {
  id: "pkt_sr007_routing_mismatch",
  context:
    "Partner-forwarded rejection email contradicts the live SR007 dashboard, which still shows the " +
    "application 'in review'. Email headers route to the catch-all, not the founder inbox.",
  user_correction:
    "It's a routing-mismatch, not a real rejection. The email hit the catch-all alias; the dashboard is source of truth.",
  chosen_agent: "Auditor",
  correction_kind: "outer",
  runtime_mode: "live",
  created_at: "2026-05-08T17:42:00.000Z",
  agent_reads: [
    {
      agent_name: "Analyst",
      archetype: "Diligence",
      situation: "Inbound says rejected; dashboard says in-review. Two systems of record disagree.",
      hidden_risk: "Treating the email as authoritative would trigger a premature withdrawal.",
      next_move: "Diff email assertions against dashboard state before any reply.",
      refusal: null,
      ordinal: 0,
    },
    {
      agent_name: "Auditor",
      archetype: "Dissent",
      situation: "Header routing to the catch-all alias is the simplest hypothesis fitting all signals.",
      hidden_risk: "The email may be a stale automation, not a human decision.",
      next_move: "Hold outbound; verify via the dashboard's system-of-record before responding.",
      refusal: "Refuses to draft a response email until provenance is confirmed.",
      ordinal: 1,
    },
  ],
};

async function main(): Promise<void> {
  const chain = pickChain();
  const vault = new Vault();

  console.log(`\n=== Liminal provenance demo — chain: ${chain.chain}/${chain.network} ===\n`);

  // 1. SIGN — persist the packet and compute its canonical commitment.
  vault.save(packet);
  console.log("[1] sign   — packet saved to vault; content stays local.");

  // 2. ANCHOR — selectively anchor the hash. Only the hash crosses the boundary.
  const receipt = await vault.anchorPacket(packet.id, chain);
  console.log("[2] anchor — receipt written back to the packet row:");
  console.log(
    indent({
      packet_hash: receipt.packet_hash,
      canonical_version: receipt.canonical_version,
      anchor_txn_id: receipt.anchor_txn_id,
      anchored_at: receipt.anchored_at,
      chain: receipt.chain,
      network: receipt.network,
      verifier: receipt.verifier,
    }),
  );

  // Show the privacy fence: the on-chain anchor carries hash + version only.
  const onChain = await chain.fetchAnchoredHash(receipt.anchor_txn_id);
  console.log("\n    on-chain payload (everything a verifier can see):");
  console.log(indent(onChain));
  const leaked = [packet.context, packet.user_correction, ...packet.agent_reads.map((r) => r.situation)]
    .filter((s): s is string => !!s)
    .some((s) => JSON.stringify(onChain).includes(s.slice(0, 24)));
  console.log(`    content leaked on chain? ${leaked ? "YES — BUG" : "no"}`);

  // 3. VERIFY — a third party recomputes the hash from the shared packet and matches it on chain.
  const shared = vault.sharePacket(packet.id)!;
  const result = await verifyPacket(shared, receipt.anchor_txn_id, chain);
  console.log(`\n[3] verify — ${result.ok ? "OK" : "FAILED"}: ${result.reason}`);

  // Tamper check: change one character and prove verification rejects it.
  const tampered: Packet = { ...shared, context: shared.context + " " };
  const tamperResult = await verifyPacket(tampered, receipt.anchor_txn_id, chain);
  console.log(`    tamper check — altered packet verifies? ${tamperResult.ok ? "YES — BUG" : "no (rejected)"}`);

  console.log("");
  if (!result.ok || leaked || tamperResult.ok) process.exit(1);
}

function indent(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .split("\n")
    .map((l) => `      ${l}`)
    .join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
