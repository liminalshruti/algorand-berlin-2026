// Refusal-as-event — a free out-of-lane refusal is a recorded first-class output, not an error.
// Critically: adding the event must NOT change the 200 / refused-free / referTo response.

import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentRegistry, type PricedAgent, type Task } from "../src/x402/agent.ts";
import { MockFacilitator, MockPayer } from "../src/x402/facilitator.ts";
import { Vault } from "../src/vault.ts";
import { PricedEndpoint, x402Exchange } from "../src/x402/gate.ts";

const clock = () => "2026-06-06T10:00:00.000Z";

function fixture() {
  const analyst: PricedAgent = {
    name: "Analyst", register: "Diligence", archetype: "Diligence", payTo: "ANALYSTWALLET", price: 10_000, asset: "ALGO",
    serve: (t) => ({ agent_name: "Analyst", archetype: "Diligence", situation: `read:${t.prompt}`, hidden_risk: null, next_move: null, refusal: null, ordinal: 0 }),
  };
  const sdr: PricedAgent = {
    name: "SDR", register: "Outreach", archetype: "Outreach", payTo: "SDRWALLET", price: 5_000, asset: "ALGO",
    serve: (t) => ({ agent_name: "SDR", archetype: "Outreach", situation: `draft:${t.prompt}`, hidden_risk: null, next_move: null, refusal: null, ordinal: 0 }),
  };
  const registry = new AgentRegistry().add(analyst).add(sdr);
  return { analyst, registry };
}

test("out-of-lane refusal emits one lane.refusal event naming the right agent", async () => {
  const { analyst, registry } = fixture();
  const vault = new Vault(clock);
  const endpoint = new PricedEndpoint(analyst, new MockFacilitator(clock), registry, { vault, clock });

  const task: Task = { id: "t", register: "Outreach", prompt: "write the follow-up email" };
  const res = await x402Exchange(endpoint, task, new MockPayer());

  assert.equal(res.outcome, "refused-free");
  assert.equal(vault.count("lane.refusal"), 1);
  const payload = vault.list("lane.refusal")[0]!.payload as { refer_to: string | null; agent: string; task_register: string };
  assert.equal(payload.refer_to, "SDR");
  assert.equal(payload.agent, "Analyst");
  assert.equal(payload.task_register, "Outreach");
});

test("the refusal response is identical with and without a vault attached", async () => {
  const { analyst, registry } = fixture();
  const task: Task = { id: "t", register: "Outreach", prompt: "write the follow-up email" };

  const withVault = await new PricedEndpoint(analyst, new MockFacilitator(clock), registry, { vault: new Vault(clock), clock }).serve(task);
  const without = await new PricedEndpoint(analyst, new MockFacilitator(clock), registry, { clock }).serve(task);

  assert.deepEqual(withVault, without); // recording the event must not alter the response
});

test("an in-lane paid call emits no lane.refusal event", async () => {
  const { analyst, registry } = fixture();
  const vault = new Vault(clock);
  const endpoint = new PricedEndpoint(analyst, new MockFacilitator(clock), registry, { vault, clock });

  await x402Exchange(endpoint, { id: "t", register: "Diligence", prompt: "diff state" }, new MockPayer());
  assert.equal(vault.count("lane.refusal"), 0);
});
