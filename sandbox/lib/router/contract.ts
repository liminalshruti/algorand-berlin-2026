// lib/router/contract.ts — types-as-comments + shared constants.
// Provider:     { id(addr), name, register, quote, asset, quality:0..1, dishonest:bool, card_uri, card_hash }
// RouteOption:  { option_id, provider_id, name, price, reputation, validation_rate, trust_score, weight }
// PaymentResult:{ payment_id, provider_id, quoted, settled, txids:[], read }
// Verdict:      { validation_id, price_match:bool, output_pass:bool|null, response:0..100, verdict_txid }
// ctx:          { net, store, session:{payer,facilitator,funded}, providers,
//                 routeStore:Map, paymentStore:Map, repState, ledger:[],
//                 deps:{ anchorNote, buildReputationEntry, anchorReputationEntry, explorerFor, settle } }

export const TRUST_WEIGHTS = { price: 0.3, reputation: 0.4, validation: 0.3 };
export const ROUTER_ROUTES = [
  "POST /api/route",
  "POST /api/pay",
  "POST /api/validate",
  "GET /api/reputation",
  "GET /api/ledger",
];

export type AlgoAccount = {
  addr: string;
  sk: Uint8Array;
};

export type Provider = {
  id: string;        // algorand:{net}:{address}
  name: string;
  register: string;  // Algorand address (payTo)
  quote: number;     // price in ALGO
  asset: string;     // 'ALGO' or ASA id
  quality: number;   // 0..1
  dishonest: boolean;
  card_uri: string;
  card_hash: string;
};

export type RouteOption = {
  option_id: string;
  provider_id: string;
  name: string;
  price: number;
  reputation: number;
  validation_rate: number;
  trust_score: number;
  weight: number;
};

export type PaymentResult = {
  payment_id: string;
  provider_id: string;
  quoted: number;
  settled: number;
  txids: string[];
  read: string;
};

export type Verdict = {
  validation_id: string;
  price_match: boolean;
  output_pass: boolean | null;
  response: number;  // 0..100
  verdict_txid: string;
};

export type RouteEntry = {
  route_id: string;
  task: string;
  options: RouteOption[];
};

export type LedgerEntry = {
  txid: string;
  schema: string;
  ref_id: string;
  hash: string;
  round: number;
  network: string;
};

export type Reputation = {
  score: number;
  reads_logged: number;
  corrections_logged: number;
};

export type RepState = {
  getReputation: (id: string) => Reputation | null;
};

export type Ctx = {
  net: string;
  store: unknown;  // algosdk.Algodv2 — only context.ts touches this
  session: {
    payer: AlgoAccount;
    facilitator: AlgoAccount;
    funded: AlgoAccount;
  };
  providers: Map<string, Provider>;
  routeStore: Map<string, RouteEntry>;
  paymentStore: Map<string, PaymentResult>;
  repState: RepState;
  ledger: LedgerEntry[];
  deps: {
    // settle a payment on-chain; injected so pay.ts stays testable
    settle: (to: string, amountAlgo: number, note: object) => Promise<{ txid: string; round: number }>;
    anchorNote: (ref_id: string, schema: string, hash: string) => Promise<{ txid: string; round: number }>;
    buildReputationEntry: (provider_id: string, score: number) => unknown;
    anchorReputationEntry: (entry: unknown) => Promise<string>;
    explorerFor: (txid: string) => string;
  };
};
