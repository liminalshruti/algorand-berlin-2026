import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';

const root = '/Users/shruti/liminal/algorand-berlin-2026';
const transport = new StdioClientTransport({
  command: resolve(root, 'node_modules/.bin/tsx'),
  args: [resolve(root, 'apps/router/bin/router-mcp-server.ts')],
  cwd: root,
  env: { ...process.env, ROUTER_URL: 'http://localhost:3005' },
  stderr: 'inherit',
});
const client = new Client({ name: 'demo-driver', version: '0.0.1' }, { capabilities: {} });
await client.connect(transport);

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
  const text = (res.content ?? []).map((c) => c.text).join('\n');
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n========== ${name}(${JSON.stringify(args)}) ==========`);
  console.log(typeof json === 'string' ? json : JSON.stringify(json, null, 2));
  if (res.isError) console.log('  ^^ isError=true');
  return json;
}

async function payUntilConfirmed(challenge_id) {
  for (let i = 0; i < 8; i++) {
    const r = await call('pay_x402', { challenge_id });
    if (r?.proof_status === 'confirmed' || r?.proof_status === undefined) return r;
    if (r?.proof_status !== 'pending_indexer') return r;
    console.log(`   ... pay_x402 pending_indexer; polling again (${i + 1})`);
  }
  return null;
}

async function feedbackUntilConfirmed(challenge_id, response, comment) {
  for (let i = 0; i < 8; i++) {
    const r = await call('give_feedback', { challenge_id, response, comment });
    if (r?.feedback_status === 'confirmed') return r;
    if (r?.feedback_status !== 'pending_indexer') return r;
    console.log(`   ... give_feedback pending_indexer; polling again (${i + 1})`);
  }
  return null;
}

const TASK = 'diligence report on an acquisition counterparty';

console.log('\n############## STEP 0: wallet + marketplace ##############');
await call('wallet_info');
await call('discover_services');

console.log('\n############## STEP 1: route (cheapest wins) ##############');
const route1 = await call('route_task', { task: TASK });
const cheat = route1.options?.[0];
console.log(`\n>>> router top pick: ${cheat?.name} ${cheat?.agent_id}\n>>> price=${cheat?.price} reputation=${cheat?.reputation} trust=${cheat?.trust_score}`);

console.log('\n############## STEP 2: x402 challenge (expect DRIFT) ##############');
const ch1 = await call('request_x402_challenge', { route_id: route1.route_id, option_id: cheat.option_id });

console.log('\n############## STEP 3: pay x402 from agent wallet -> proof -> rep DROP ##############');
const pay1 = await payUntilConfirmed(ch1.challenge_id);
console.log(`\n>>> settle txid: ${pay1?.settle_txid}\n>>> explorer: ${pay1?.explorer}\n>>> quote=${pay1?.quote_amount} settled=${pay1?.settled_amount} drift=${pay1?.quote_drift}\n>>> new_reputation(cheat)=${pay1?.new_reputation}`);

console.log('\n############## STEP 4: read reputation (cheat should be 0) ##############');
await call('get_reputation', { agent_id: ch1.agent_id });

console.log('\n############## STEP 5: re-route -> should AVOID the cheat ##############');
const route2 = await call('route_task', { task: TASK });
console.log(`\n>>> after drift, options: ${(route2.options || []).map((o) => `${o.name} (rep ${o.reputation}, price ${o.price})`).join('  |  ')}`);
const honest = route2.options?.[0];

console.log('\n############## STEP 6: pay the honest agent (no drift) + GOOD feedback ##############');
const ch2 = await call('request_x402_challenge', { route_id: route2.route_id, option_id: honest.option_id });
const pay2 = await payUntilConfirmed(ch2.challenge_id);
console.log(`\n>>> honest settle txid: ${pay2?.settle_txid}  drift=${pay2?.quote_drift}`);
const fb = await feedbackUntilConfirmed(ch2.challenge_id, 100, 'accurate, on-quote');
console.log(`\n>>> feedback accepted=${fb?.accepted} new_reputation(honest)=${fb?.new_reputation} auth_txid=${fb?.auth_txid}`);
await call('get_reputation', { agent_id: ch2.agent_id });

console.log('\n############## DONE ##############');
await client.close();
process.exit(0);
