// Shared Algorand client substrate (Sean lane · Berlin AlgoHack).
//
// One Algorand client, two uses:
//   · provenance anchoring (chain/algorand.ts) — 0-ALGO self-payment carrying a hash in the note;
//   · x402 settlement (x402/settle.ts)         — real payments between agents.
//
// Mechanics + env vars match the proven workspace adapter liminal-test/src/infra/algorand.ts.
// algosdk is an optionalDependency loaded via dynamic import, so the mock-backed tests/demos run
// with no install; only the real localnet/testnet paths reach this loader.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

export type AlgoNetwork = "localnet" | "testnet";

/** AlgoKit LocalNet well-known algod/kmd/indexer token. */
export const LOCAL_TOKEN = "a".repeat(64);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- algosdk is dynamically imported
export type AlgoSdk = any;

export interface AlgorandConfig {
  network: AlgoNetwork;
  algodUrl: string;
  algodPort: string;
  algodToken: string;
  indexerUrl: string;
  kmdUrl: string;
  kmdPort: string;
  accountFile: string;
  genesisId: string;
}

export function configFor(network: AlgoNetwork): AlgorandConfig {
  const local = network === "localnet";
  return {
    network,
    algodUrl: process.env.LIMINAL_ALGOD_URL ?? (local ? "http://localhost" : "https://testnet-api.algonode.cloud"),
    algodPort: process.env.LIMINAL_ALGOD_PORT ?? (local ? "4001" : ""),
    algodToken: local ? LOCAL_TOKEN : "",
    indexerUrl: process.env.LIMINAL_INDEXER_URL ?? (local ? "http://localhost:8980" : "https://testnet-idx.algonode.cloud"),
    kmdUrl: process.env.LIMINAL_KMD_URL ?? "http://localhost",
    kmdPort: process.env.LIMINAL_KMD_PORT ?? "4002",
    accountFile: new URL("../../.algo-testnet-account.json", import.meta.url).pathname,
    genesisId: local ? "dockernet-v1" : "testnet-v1.0",
  };
}

let sdkCache: AlgoSdk | null = null;

export async function loadAlgosdk(): Promise<AlgoSdk> {
  if (sdkCache) return sdkCache;
  try {
    const mod = (await import("algosdk")) as { default?: AlgoSdk } & AlgoSdk;
    sdkCache = mod.default ?? mod;
    return sdkCache;
  } catch {
    throw new Error(
      "algosdk is not installed — run `npm install` (it is an optionalDependency). " +
        "The mock backends need no install; only real localnet/testnet networking requires algosdk.",
    );
  }
}

export function algodFor(sdk: AlgoSdk, cfg: AlgorandConfig): AlgoSdk {
  return new sdk.Algodv2(cfg.algodToken, cfg.algodUrl, cfg.algodPort);
}

export function addrStr(addr: unknown): string {
  return typeof addr === "string" ? addr : String(addr);
}

export interface AlgoAccount {
  address: string;
  sk: Uint8Array;
}

// localnet: pull a pre-funded account from the KMD default wallet — no secrets.
// testnet: LIMINAL_ALGO_MNEMONIC, else a persisted generated account (must be funded once).
export async function accountFor(sdk: AlgoSdk, cfg: AlgorandConfig): Promise<AlgoAccount> {
  const fromEnv = process.env.LIMINAL_ALGO_MNEMONIC;
  if (fromEnv) {
    const a = sdk.mnemonicToSecretKey(fromEnv.trim());
    return { address: addrStr(a.addr), sk: a.sk };
  }
  if (cfg.network === "localnet") {
    const kmd = new sdk.Kmd(LOCAL_TOKEN, cfg.kmdUrl, cfg.kmdPort);
    const { wallets } = await kmd.listWallets();
    const w = wallets.find((x: { name: string }) => x.name === "unencrypted-default-wallet") ?? wallets[0];
    const handle = (await kmd.initWalletHandle(w.id, "")).wallet_handle_token;
    const { addresses } = await kmd.listKeys(handle);
    const best = addresses[0]; // any pre-seeded LocalNet account is funded
    const { private_key } = await kmd.exportKey(handle, "", best);
    await kmd.releaseWalletHandle(handle).catch(() => {});
    return { address: addrStr(best), sk: private_key };
  }
  if (existsSync(cfg.accountFile)) {
    const { mnemonic } = JSON.parse(readFileSync(cfg.accountFile, "utf8")) as { mnemonic: string };
    const a = sdk.mnemonicToSecretKey(mnemonic);
    return { address: addrStr(a.addr), sk: a.sk };
  }
  const acct = sdk.generateAccount();
  const mnemonic = sdk.secretKeyToMnemonic(acct.sk);
  const address = addrStr(acct.addr);
  writeFileSync(cfg.accountFile, JSON.stringify({ address, mnemonic }, null, 2));
  throw new Error(
    `Generated a new testnet account ${address} and wrote ${cfg.accountFile}. ` +
      "Fund it from https://bank.testnet.algorand.network then re-run.",
  );
}

/** Pull a confirmed transaction's note + timing back from the indexer (retries for indexer lag). */
export interface FetchedTxn {
  note: string | undefined;
  roundTime: number | null;
  confirmedRound: number | null;
  receiver: string | null;
  amount: number | null;
  /** ASA id for asset transfers; null for native ALGO payments. */
  assetId: number | null;
}

export async function fetchTxn(cfg: AlgorandConfig, txnId: string): Promise<FetchedTxn | null> {
  const headers: Record<string, string> = cfg.network === "localnet" ? { "X-Indexer-API-Token": LOCAL_TOKEN } : {};
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${cfg.indexerUrl}/v2/transactions/${txnId}`, { headers });
    if (res.ok) {
      const data = (await res.json()) as {
        transaction?: {
          note?: string;
          "round-time"?: number;
          "confirmed-round"?: number;
          "payment-transaction"?: { receiver?: string; amount?: number };
          "asset-transfer-transaction"?: { receiver?: string; amount?: number; "asset-id"?: number };
        };
      };
      const tx = data.transaction;
      if (tx) {
        const axfer = tx["asset-transfer-transaction"];
        const pay = tx["payment-transaction"] ?? axfer;
        return {
          note: tx.note,
          roundTime: tx["round-time"] ?? null,
          confirmedRound: tx["confirmed-round"] ?? null,
          receiver: pay?.receiver ?? null,
          amount: pay?.amount ?? null,
          assetId: axfer?.["asset-id"] ?? null,
        };
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}
