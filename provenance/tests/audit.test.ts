// Per-call audit wrapper — one agent.call event per call (forensic invariant).

import { test } from "node:test";
import assert from "node:assert/strict";
import { Vault } from "../src/vault.ts";
import { auditedCall } from "../src/audit.ts";
import { AgentRegistry, type PricedAgent, type Task } from "../src/x402/agent.ts";
import { MockFacilitator, MockPayer } from "../src/x402/facilitator.ts";
import { MockAnchorChain } from "../src/chain/mock.ts";
import { PricedEndpoint, x402Exchange } from "../src/x402/gate.ts";

const clock = () => "2026-06-06T10:00:00.000Z";

test("auditedCall emits exactly one agent.call event and returns the wrapped result", async () => {
  const vault = new Vault(clock);
  const out = await auditedCall(vault, {
    decision_tag: "serve_priced_read",
    runtime: "demo",
    invoke: async () => ({ result: { ok: true }, input_tokens: 0, output_tokens: 0 }),
    extra: { agent: "Analyst" },
  });
  assert.deepEqual(out.result, { ok: true });
  assert.equal(vault.count("agent.call"), 1);

  const payload = vault.list("agent.call")[0]!.payload as Record<string, unknown>;
  assert.equal(payload.decision_tag, "serve_priced_read");
  assert.equal(payload.runtime, "demo");
  assert.equal(typeof payload.latency_ms, "number");
  assert.ok((payload.latency_ms as number) >= 0);
  assert.equal(payload.input_tokens, 0);
  assert.equal(payload.agent, "Analyst"); // merged extra
});

test("N audited calls produce exactly N agent.call rows", async () => {
  const vault = new Vault(clock);
  for (let i = 0; i < 3; i++) {
    await auditedCall(vault, {
      decision_tag: "settle_payment",
      runtime: "live",
      invoke: async () => ({ result: i, input_tokens: 0, output_tokens: 0 }),
    });
  }
  assert.equal(vault.count("agent.call"), 3);
});

test("an invalid decision_tag throws", async () => {
  const vault = new Vault(clock);
  await assert.rejects(
    () =>
      auditedCall(vault, {
        decision_tag: "frobnicate" as never,
        runtime: "live",
        invoke: async () => ({ result: 1, input_tokens: 0, output_tokens: 0 }),
      }),
    /not in the canonical taxonomy/,
  );
});

test("a paid in-lane x402 exchange records settle_payment + serve_priced_read", async () => {
  const analyst: PricedAgent = {
    name: "Analyst", register: "Diligence", archetype: "Diligence", payTo: "ANALYSTWALLET", price: 10_000, asset: "ALGO",
    serve: (t) => ({ agent_name: "Analyst", archetype: "Diligence", situation: `read:${t.prompt}`, hidden_risk: null, next_move: null, refusal: null, ordinal: 0 }),
  };
  const registry = new AgentRegistry().add(analyst);
  const vault = new Vault(clock);
  const endpoint = new PricedEndpoint(analyst, new MockFacilitator(clock), registry, { vault, anchorChain: new MockAnchorChain(clock), clock });

  const res = await x402Exchange(endpoint, { id: "t", register: "Diligence", prompt: "diff" } satisfies Task, new MockPayer());
  assert.equal(res.outcome, "paid");
  assert.equal(vault.count("agent.call"), 2);
  const tags = vault.list("agent.call").map((e) => (e.payload as { decision_tag: string }).decision_tag).sort();
  assert.deepEqual(tags, ["serve_priced_read", "settle_payment"]);
});
