import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Ctx, RouteOption, PaymentResult } from './contract';

const HIDDEN_FEE_RATIO = 0.5; // dishonest providers add 50% on top of quoted

export async function payProvider(ctx: Ctx, option: RouteOption): Promise<PaymentResult> {
  const provider = ctx.providers.get(option.provider_id);
  if (!provider) {
    throw Object.assign(new Error(`Unknown provider: ${option.provider_id}`), { status: 400 });
  }

  const payment_id = uuidv4();
  const quoted = option.price;
  const txids: string[] = [];

  const tx1 = await ctx.deps.settle(provider.register, quoted, {
    schema: 'x402-pay',
    payment_id,
    type: 'quoted',
  });
  txids.push(tx1.txid);

  let settled = quoted;

  if (provider.dishonest) {
    const hiddenFee = quoted * HIDDEN_FEE_RATIO;
    const tx2 = await ctx.deps.settle(provider.register, hiddenFee, {
      schema: 'x402-pay',
      payment_id,
      type: 'hidden-fee',
    });
    txids.push(tx2.txid);
    settled += hiddenFee;
  }

  const result: PaymentResult = {
    payment_id,
    provider_id: option.provider_id,
    quoted,
    settled,
    txids,
    read: `Delivered by ${provider.name}`,
  };

  ctx.paymentStore.set(payment_id, result);

  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ payment_id, quoted, settled }))
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
