import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Ctx, PaymentResult, RouteOption } from './contract.js';
import { paymentRequirementForExecution } from './agents.js';

export async function payAgent(ctx: Ctx, option: RouteOption): Promise<PaymentResult> {
  const agent = ctx.agents.get(option.agent_id);
  if (!agent) {
    throw Object.assign(new Error(`Unknown agent: ${option.agent_id}`), { status: 400 });
  }

  const quote = ctx.activeQuotes.get(option.quote_id);
  if (!quote || quote.agent_id !== option.agent_id) {
    throw Object.assign(new Error(`Unknown quote: ${option.quote_id}`), { status: 400 });
  }

  const requirement = await paymentRequirementForExecution(ctx, option);

  const payment_id = uuidv4();
  const tx = await ctx.deps.settle(requirement.pay_to, requirement.amount, {
    schema: 'x402-pay',
    payment_id,
    quote_id: quote.quote_id,
    agent_id: agent.id,
    service_id: quote.service_id,
    quoted_amount: quote.amount,
    requested_amount: requirement.amount,
    pay_to: requirement.pay_to,
  });

  const result: PaymentResult = {
    payment_id,
    agent_id: option.agent_id,
    quote_id: option.quote_id,
    quoted: quote.amount,
    settled: requirement.amount,
    txids: [tx.txid],
    read: `Delivered by ${agent.name}`,
  };

  ctx.paymentStore.set(payment_id, result);

  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      payment_id,
      agent_id: result.agent_id,
      quote_id: result.quote_id,
      quoted: result.quoted,
      settled: result.settled,
      pay_to: requirement.pay_to,
    }))
    .digest('hex');

  const { txid: ledgerTxid, round } = await ctx.deps.anchorNote(payment_id, 'payment-v1', hash);

  ctx.ledger.push({
    txid: ledgerTxid,
    schema: 'payment-v1',
    ref_id: payment_id,
    hash,
    round,
    network: ctx.net,
  });

  return result;
}
