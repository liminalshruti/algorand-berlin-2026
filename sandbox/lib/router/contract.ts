// lib/router/contract.ts — shared router wire/state types.
// Agent:        { id, name, agent_uri, agent_wallet }
// AgentService: { service_id, agent_id, protocol, endpoint, name }
// ActiveQuote:  { quote_id, agent_id, service_id, amount, asset, pay_to }
// RouteOption:  { option_id, agent_id, service_id, quote_id, name, price, asset, pay_to, reputation, trust_score }
// PaymentResult:{ payment_id, agent_id, quote_id, quoted, settled, txids:[], read }
// Verdict:      { validation_id, price_match:bool, output_pass:bool|null, response:0..100, verdict_txid }
// ctx:          { net, store, session:{payer,facilitator,funded}, agents,
//                 services, activeQuotes, paymentRequirements, routeStore:Map, paymentStore:Map, repState, ledger:[],
//                 deps:{ anchorNote, buildReputationEntry, anchorReputationEntry, explorerFor, settle } }

export const TRUST_WEIGHTS = { price: 0.4, reputation: 0.6 };
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

export type Agent = {
  id: string;          // router/demo-stable selected-agent key
  name: string;
  agent_uri: string;
  agent_wallet: string; // Algorand address (expected pay_to)
};

export type AgentService = {
  service_id: string;
  agent_id: string;
  protocol: "MCP" | "A2A";
  endpoint: string;
  name: string;
};

export type ActiveQuote = {
  quote_id: string;
  agent_id: string;
  service_id: string;
  amount: number;
  asset: string;
  pay_to: string;
};

export type PaymentRequirement = {
  quote_id: string;
  amount: number;
  asset: string;
  pay_to: string;
};

export type RouteOption = {
  option_id: string;
  agent_id: string;
  service_id: string;
  quote_id: string;
  name: string;
  price: number;
  asset: string;
  pay_to: string;
  reputation: number;
  trust_score: number;
};

export type PaymentResult = {
  payment_id: string;
  agent_id: string;
  quote_id: string;
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
  service_id: string;
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
  agents: Map<string, Agent>;
  services: AgentService[];
  activeQuotes: Map<string, ActiveQuote>;
  paymentRequirements: Map<string, PaymentRequirement>;
  routeStore: Map<string, RouteEntry>;
  paymentStore: Map<string, PaymentResult>;
  repState: RepState;
  ledger: LedgerEntry[];
  deps: {
    // settle a payment on-chain; injected so pay.ts stays testable
    settle: (to: string, amountAlgo: number, note: object) => Promise<{ txid: string; round: number }>;
    anchorNote: (ref_id: string, schema: string, hash: string) => Promise<{ txid: string; round: number }>;
    buildReputationEntry: (agent_id: string, score: number) => unknown;
    anchorReputationEntry: (entry: unknown) => Promise<string>;
    explorerFor: (txid: string) => string;
  };
};
