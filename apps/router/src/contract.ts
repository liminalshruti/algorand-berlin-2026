// lib/router/contract.ts — shared router wire/state types.
// Agent:        { id, name, agent_uri, agent_wallet }
// AgentService: { service_id, agent_id, protocol, endpoint, name, description?, source? }
// QuoteSnapshot:{ agent_id, service_id, amount, asset, pay_to, observed_at, expires_at, source }
// ActiveQuote:  { quote_id, agent_id, service_id, amount, asset, pay_to, observed_at, expires_at }
// PaymentChallenge:{ challenge_id, route_id, option_id, agent_id, service_id, quote_id, nonce,
//                    resource, amount, asset, pay_to, network, payment_note, observed_at, expires_at }
// RouteOption:  { option_id, agent_id, service_id, quote_id, name, price, asset, pay_to, reputation, trust_score }
// PaymentResult:{ payment_id, agent_id, quote_id, quoted, settled, txids:[], read }
// Verdict:      { validation_id, price_match:bool, output_pass:bool|null, response:0..100, verdict_txid }
// ctx:          { net, store, session:{payer,facilitator,funded}, agents,
//                 services, quoteCache, activeQuotes, paymentRequirements, routeStore:Map, paymentStore:Map, repState, ledger:[],
//                 deps:{ anchorNote, buildReputationEntry, anchorReputationEntry, explorerFor, settle } }

export const TRUST_WEIGHTS = { price: 0.4, reputation: 0.6 };
export const ROUTER_ROUTES = [
  "POST /api/route",
  "POST /api/challenge",
  "GET /api/challenge/:challenge_id",
  "POST /api/payment-proof",
  "POST /api/feedback/intent",
  "POST /api/feedback",
  "POST /api/pay",
  "POST /api/validate",
  "GET /api/reputation",
  "GET /api/ledger",
  "GET /api/services",
  "POST /mcp",
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
  description?: string;
  source?: "seed" | "agent_uri" | "manual";
};

export type ActiveQuote = {
  quote_id: string;
  agent_id: string;
  service_id: string;
  amount: number;
  asset: string;
  pay_to: string;
  observed_at: string;
  expires_at: string;
};

export type QuoteSnapshot = {
  agent_id: string;
  service_id: string;
  amount: number;
  asset: string;
  pay_to: string;
  network?: string;
  resource?: string;
  nonce?: string;
  observed_at: string;
  expires_at: string;
  source: "seed" | "agent_uri" | "manual" | "unknown";
};

export type PaymentRequirement = {
  quote_id: string;
  amount: number;
  asset: string;
  pay_to: string;
  network?: string;
  resource?: string;
  nonce?: string;
  expires_at?: string;
};

export type PaymentChallenge = {
  challenge_id: string;
  route_id: string;
  option_id: string;
  agent_id: string;
  service_id: string;
  quote_id: string;
  nonce: string;
  resource: string;
  amount: number;
  asset: string;
  pay_to: string;
  network: string;
  quote_amount: number;
  quote_pay_to: string;
  quote_expires_at: string;
  payment_note: string;
  quote_drift: boolean;
  observed_at: string;
  expires_at: string;
  payment_txid?: string;
  payer?: string;
  proof_accepted_at?: string;
  validation_id?: string;
  validation_txid?: string;
  ledger_txid?: string;
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

export type OnChainPayment = {
  txid: string;
  sender: string;
  receiver: string;
  amount: number;
  asset: string;
  network: string;
  note?: string;
  round?: number;
};

export type AccountBalance = {
  amount: number;
  min_balance: number;
  available: number;
};

export type FeedbackIntent = {
  feedback_intent_id: string;
  challenge_id: string;
  payment_txid: string;
  payer: string;
  agent_id: string;
  quote_id: string;
  response: number;
  nonce: string;
  note: string;
  note_hash: string;
  created_at: string;
  expires_at: string;
  accepted_at?: string;
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
  quoteCache: Map<string, QuoteSnapshot>;
  activeQuotes: Map<string, ActiveQuote>;
  paymentRequirements: Map<string, PaymentRequirement>;
  routeStore: Map<string, RouteEntry>;
  paymentStore: Map<string, PaymentResult>;
  challengeStore?: Map<string, PaymentChallenge>;
  feedbackIntentStore?: Map<string, FeedbackIntent>;
  usedFeedbackPaymentTxids?: Set<string>;
  repState: RepState;
  ledger: LedgerEntry[];
  deps: {
    // settle a payment on-chain; injected so pay.ts stays testable
    settle: (to: string, amountAlgo: number, note: object) => Promise<{ txid: string; round: number }>;
    anchorNote: (ref_id: string, schema: string, hash: string) => Promise<{ txid: string; round: number }>;
    lookupPayment?: (txid: string) => Promise<OnChainPayment | null>;
    accountBalance?: (address: string) => Promise<AccountBalance | null>;
    buildReputationEntry: (agent_id: string, score: number) => unknown;
    anchorReputationEntry: (entry: unknown) => Promise<string>;
    explorerFor: (txid: string) => string;
  };
};
