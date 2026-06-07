/*
 * router.js · Liminal x402 Trust Router · UI lane (Shruti)
 * ════════════════════════════════════════════════════════════════════
 * The router flow inside the Liminal desktop-app shell (cut-shell.css).
 *   loop spine: Request → Rank → Pay → Validate → Reputation → Re-run
 * Mock-first; per-endpoint LIVE switch with graceful mock fallback so the
 * loop always completes even when only some endpoints are live (:3001).
 * Codes strictly to the frozen response shapes (contract.ts); identity +
 * before-score come from the picked RouteOption, never from pay/validate.
 */

/* ───────────────────────────── config ─────────────────────────────── */
const BASE_URL = "http://localhost:3001";   // Navid's router-server (INTEGRATION_HANDOFF.md)
// per-endpoint: true = live server (mock fallback on failure), false = mock.
const LIVE = { route: true, pay: true, validate: true, reputation: true, ledger: true, challenge: true, paymentProof: true, feedbackIntent: true, feedback: true };
const ANY_LIVE = Object.values(LIVE).some(Boolean);
const NETWORK  = "testnet";   // pinned to TestNet — matches wallet.js + router-server; never switch
const OPERATOR_WALLET = "NDX7OC2VNQIDKH7BHE5IVUH75GAZ4ZWKL2BNHM6G3ZWQTQDFDN2AHVUCIQ"; // one consistent operator wallet — no impersonation
const TRUST_WEIGHTS = { price: 0.4, reputation: 0.6 };
const MOCK_LATENCY = { route: 260, pay: 460, validate: 620 };
const BEAT = 460;   // reveal pacing — lets the gap land, then the verdict, then the score-drop
const EXPLORER = {
  localnet: (tx) => `https://lora.algokit.io/localnet/transaction/${tx}`,
  testnet:  (tx) => `https://lora.algokit.io/testnet/transaction/${tx}`,
  mainnet:  (tx) => `https://lora.algokit.io/mainnet/transaction/${tx}`,
};
// deployed ARC-8004 registries (apps/web/deployed.testnet.json) — shown in the
// chain-state HUD, same ids the registry pages surface, clickable to explorer.
const REGISTRY_APPS = { identity: 764031067, reputation: 764031363, validation: 764031094 };
const EXPLORER_APP = (id) => `https://lora.algokit.io/${NETWORK}/application/${id}`;
const DEFAULT_SERVICE_ID = "diligence.report";
const SERVICE_TASKS = {
  "diligence.report": "Diligence read: partner email says rejected; dashboard says in-review",
  "outreach.draft": "Draft a follow-up to the warm intro from last week",
  "judgment.verdict": "Verdict: is this LOI worth countersigning as written?",
  "operations.reconcile": "Reconcile the June invoice batch against the ledger",
};
const SERVICE_LABELS = {
  "diligence.report": "diligence report",
  "outreach.draft": "outreach draft",
  "judgment.verdict": "judgment verdict",
  "operations.reconcile": "operations reconcile",
};
// #4 — friendly, on-pitch labels for both the UI mock schemas AND the live
// server schemas (Navid anchors `payment-v1`; reputation anchors `algorand-rep-v1`)
// so the live ledger reads the same as the demo narrative.
const SCHEMA_MEANING = {
  "x402.settle": "the x402 payment settlement (quoted amount)",
  "x402.settle.fee": "a second settlement above the active quote",
  "erc8004.feedback": "legacy validation verdict evidence",
  "liminal.validation.v1": "the validation verdict evidence for quote-vs-payment",
  "payment-v1": "the x402 payment settlement, anchored hash-only on Algorand",
  "algorand-rep-v1": "the reputation feedback entry (ERC-8004-shaped)",
  "liminal.dispute": "an operator dispute filed against a caught agent",
  "x402.settle.pera": "operator-signed settlement anchored on TestNet via Pera Wallet",
};
const SCHEMA_LABEL = {
  "x402.settle": "x402 settle", "x402.settle.fee": "quote drift", "erc8004.feedback": "verdict", "liminal.validation.v1": "validation",
  "payment-v1": "x402 settle", "algorand-rep-v1": "reputation", "liminal.dispute": "dispute",
  "x402.settle.pera": "pera settle",
};
const schemaLabel = (s) => SCHEMA_LABEL[s] || s;
const isFeeSchema = (s) => s.includes("fee");

/* ──────────────────────── mock backend state ──────────────────────── */
const mock = {
  seq: 0, routes: new Map(), payments: new Map(), challenges: new Map(), ledger: [],
  agents: [
    pv("Helios Diligence",   "diligence.report",     0.38, 0.38, 20, 3),
    pv("Borealis Analytics", "diligence.report",     0.34, 0.34, 20, 5),
    pv("Vega Quotes",        "diligence.report",     0.30, 0.55, 8,  1),
    pv("Nimbus Newcomer",    "diligence.report",     0.28, 0.28, 0,  0),
    pv("Comet Outreach",     "outreach.draft",       0.20, 0.20, 15, 2),
    pv("Orion Drafts",       "outreach.draft",       0.26, 0.39, 18, 6),
    pv("Arbiter Prime",      "judgment.verdict",     0.50, 0.50, 30, 4),
    pv("Verdict Labs",       "judgment.verdict",     0.42, 0.63, 22, 7),
    pv("Atlas Ops",          "operations.reconcile", 0.18, 0.18, 25, 3),
    pv("Forge Runners",      "operations.reconcile", 0.24, 0.36, 12, 5),
  ],
};
function pv(name, service_id, price, challenge_price, reads, corrections) {
  const addr = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 16).padEnd(16, "X");
  return { id: `algorand:${NETWORK}:${addr}`, name, service_id, price, challenge_price, reads, corrections,
           by_tag: corrections > 0 ? { missed_compensation: corrections } : {} };
}
const scoreOf = (p) => (p.reads > 0 ? Math.round(100 * (p.reads - p.corrections) / p.reads) : null);
const rand32 = (n = 52) => { const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let s = ""; for (let i = 0; i < n; i++) s += a[(Math.random() * 32) | 0]; return s; };
const hashHex = (n = 64) => { const a = "0123456789abcdef"; let s = ""; for (let i = 0; i < n; i++) s += a[(Math.random() * 16) | 0]; return s; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let mockRound = 41000000 + ((Math.random() * 1000) | 0);

function trustParts(price, reputation, all) {
  const prices = all.map((x) => x.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const priceScore = max === min ? 1 : (max - price) / (max - min);
  return {
    price: priceScore * TRUST_WEIGHTS.price,
    reputation: (reputation / 100) * TRUST_WEIGHTS.reputation,
  };
}
const trustScore = (price, rep, all) => { const p = trustParts(price, rep, all); return p.price + p.reputation; };

const mockApi = {
  async route({ task, service_id = DEFAULT_SERVICE_ID }) {
    await wait(MOCK_LATENCY.route);
    const inService = mock.agents.filter((p) => p.service_id === service_id);
    const ranked = inService.filter((p) => scoreOf(p) != null && scoreOf(p) > 0);
    const excluded = inService.filter((p) => scoreOf(p) == null || scoreOf(p) === 0)
      .map((p) => ({ agent_id: p.id, name: p.name, reason: "no validated history" }));
    const scored = ranked.map((p) => ({ p, t: trustScore(p.price, scoreOf(p), ranked) }));
    const options = scored.map(({ p, t }) => ({
      option_id: `opt_${p.id.split(":").pop().slice(0, 6)}`,
      agent_id: p.id, service_id, quote_id: `q_${p.id.split(":").pop().slice(0, 6)}`,
      name: p.name, price: p.price, asset: "ALGO", pay_to: p.id.split(":").pop(), reputation: scoreOf(p),
      trust_score: Math.round(t * 100),
    })).sort((a, b) => b.trust_score - a.trust_score);
    const route_id = `rt_${++mock.seq}`;
    mock.routes.set(route_id, { task, service_id, options });
    return { route_id, task, service_id, options, excluded };
  },
  async pay({ route_id, option_id }) {
    await wait(MOCK_LATENCY.pay);
    const route = mock.routes.get(route_id);
    const opt = route && route.options.find((o) => o.option_id === option_id);
    if (!opt) { const e = new Error("unknown route/option"); e.status = 400; throw e; }
    const agent = mock.agents.find((p) => p.id === opt.agent_id);
    const quoted = opt.price;
    const settled = Math.round(agent.challenge_price * 100) / 100;
    const txids = [rand32()];
    const payment_id = `pay_${++mock.seq}`;
    const nonce = (Math.random() * 1e6) | 0;
    mock.payments.set(payment_id, { route_id, option_id, agent_id: opt.agent_id, quoted, settled });
    txids.forEach((tx) => mock.ledger.unshift({ txid: tx, schema: "x402.settle", ref_id: payment_id, hash: hashHex(), round: ++mockRound, network: NETWORK }));
    return {
      payment_id, agent_id: opt.agent_id, quote_id: opt.quote_id, txids, quoted_amount: quoted, settled_amount: settled,
      read: settled > quoted + 1e-9 ? "Delivered read (requested above quote)." : "Delivered read.",
      proof_of_payment: { from: OPERATOR_WALLET, to: agent.id.split(":").pop(), asset: 0, amount: Math.round(settled * 1e6), txid: txids[0], round: mockRound, nonce },
    };
  },
  async validate({ payment_id }) {
    await wait(MOCK_LATENCY.validate);
    const pay = mock.payments.get(payment_id);
    if (!pay) { const e = new Error("unknown payment"); e.status = 400; throw e; }
    const agent = mock.agents.find((p) => p.id === pay.agent_id);
    const price_match = pay.settled <= pay.quoted + 1e-9;
    const output_pass = null;
    const response = price_match ? 100 : 0;
    if (response < 100) {
      agent.reads += 1; agent.corrections = agent.reads;
      const tag = "missed_compensation";
      agent.by_tag[tag] = (agent.by_tag[tag] || 0) + 1;
    } else { agent.reads += 1; }
    const verdict_txid = rand32();
    mock.ledger.unshift({ txid: verdict_txid, schema: "liminal.validation.v1", ref_id: payment_id, hash: hashHex(), round: ++mockRound, network: NETWORK });
    return { validation_id: `val_${++mock.seq}`, price_match, output_pass, response, new_reputation: scoreOf(agent), verdict_txid };
  },
  async reputation(agent) {
    const p = mock.agents.find((x) => x.id === agent);
    if (!p) return null;
    return { agent_id: p.id, score: scoreOf(p), reads_logged: p.reads, corrections_logged: p.corrections, by_tag: p.by_tag, uri: `liminal://corrections/${p.id}`, hash: hashHex() };
  },
  // ── proof path · mirror Reza/Shayaun server contracts (challenge → payment-proof → feedback) ──
  async challenge({ route_id, option_id }) {
    await wait(MOCK_LATENCY.pay);
    const route = mock.routes.get(route_id);
    const opt = route && route.options.find((o) => o.option_id === option_id);
    if (!opt) { const e = new Error("unknown route/option"); e.status = 400; throw e; }
    const agent = mock.agents.find((p) => p.id === opt.agent_id);
    const challenge_id = `ch_${++mock.seq}`;
    const nonce = String((Math.random() * 1e9) | 0);
    const amount = Math.round(agent.challenge_price * 100) / 100;   // execution-mode 402 (may exceed quote)
    const payment_note = JSON.stringify({ schema: "trust-router.challenge.v1", challenge_id, nonce });
    const expires_at = new Date(Date.now() + 5 * 60000).toISOString();
    const ch = {
      challenge_id, route_id, option_id, agent_id: opt.agent_id, service_id: opt.service_id, quote_id: opt.quote_id,
      amount, asset: "ALGO", pay_to: opt.pay_to, network: NETWORK, nonce, resource: opt.service_id, expires_at, payment_note,
      quote: { amount: opt.price, asset: "ALGO", pay_to: opt.pay_to, expires_at },
      quote_drift: amount > opt.price + 1e-9,
    };
    mock.challenges.set(challenge_id, ch);
    return ch;
  },
  async paymentProof({ challenge_id, txid, payer }) {
    await wait(MOCK_LATENCY.validate);
    const ch = mock.challenges.get(challenge_id);
    if (!ch) { const e = new Error("unknown challenge_id"); e.status = 400; throw e; }
    const agent = mock.agents.find((p) => p.id === ch.agent_id);
    const drift = ch.quote_drift;
    if (drift) { agent.reads += 1; agent.corrections = agent.reads; agent.by_tag["missed_compensation"] = (agent.by_tag["missed_compensation"] || 0) + 1; }
    else { agent.reads += 1; }
    const ledger_txid = rand32();   // mock = hash-only validation anchor (on-chain ValidationRegistry write is env-gated server-side)
    mock.ledger.unshift({ txid: ledger_txid, schema: "liminal.validation.v1", ref_id: challenge_id, hash: hashHex(), round: ++mockRound, network: NETWORK });
    ch.payment_txid = txid; ch.payer = payer;
    return { accepted: true, challenge_id, payment_txid: txid, agent_id: ch.agent_id, policy_result: drift ? "quote_drift" : "fair", quote_drift: drift, validation_id: `val_${++mock.seq}`, validation_txid: null, ledger_txid, new_reputation: scoreOf(agent) };
  },
  async feedbackIntent({ challenge_id, payment_txid, payer, response }) {
    await wait(160);
    const feedback_intent_id = `fbi_${++mock.seq}`;
    const note = JSON.stringify({ schema: "trust-router.feedback-auth.v1", feedback_intent_id, challenge_id, payment_txid, payer, response });
    return { feedback_intent_id, proof_id: payment_txid, note, note_hash: hashHex(), expires_at: new Date(Date.now() + 10 * 60000).toISOString() };
  },
  async feedback({ feedback_intent_id, auth_txid, agent_id, response }) {
    await wait(220);
    const agent = mock.agents.find((p) => p.id === agent_id);
    if (agent) agent.reads += 1;
    const ledger_txid = rand32();
    mock.ledger.unshift({ txid: ledger_txid, schema: "algorand-rep-v1", ref_id: feedback_intent_id, hash: hashHex(), round: ++mockRound, network: NETWORK });
    return { accepted: true, feedback_id: `fb_${++mock.seq}`, proof_id: auth_txid, agent_id, response, new_reputation: agent ? scoreOf(agent) : null, reputation_txid: null, ledger_txid, rebate_txid: null };
  },
  async ledgerAll() { return { anchors: mock.ledger.slice() }; },
};

/* ───────────────── api wrapper · live with mock fallback (#13) ─────── */
const srcMode = {};   // ep → "live" | "mock" | "fallback"
let serverUp = false; // set by probe(): is the router-server reachable on :3001?
async function http(method, path, body) {
  const res = await fetch(BASE_URL + path, body ? { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { method });
  if (!res.ok) { const e = new Error(`${path} → ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}
async function probe() {   // health check — gate live attempts on a reachable server
  if (!ANY_LIVE) { serverUp = false; renderSrc(); return false; }
  try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 1500); const r = await fetch(BASE_URL + "/api/ledger", { signal: c.signal }); clearTimeout(t); serverUp = r.ok; }
  catch (_) { serverUp = false; }
  setBanner(); renderSrc(); return serverUp;
}
async function call(ep, liveFn, mockFn) {
  if (LIVE[ep] && serverUp) {
    try { const r = await liveFn(); srcMode[ep] = "live"; renderSrc(); return r; }
    catch (_) { srcMode[ep] = "fallback"; renderSrc(); return mockFn(); }   // graceful degrade (e.g. endpoint still stubbed)
  }
  srcMode[ep] = LIVE[ep] ? "fallback" : "mock"; renderSrc(); return mockFn();
}
const api = {
  route: (b) => call("route", () => http("POST", "/api/route", b), () => mockApi.route(b)),
  pay: (b) => call("pay", () => http("POST", "/api/pay", b), () => mockApi.pay(b)),
  validate: (b) => call("validate", () => http("POST", "/api/validate", b), () => mockApi.validate(b)),
  reputation: (p) => call("reputation", () => http("GET", `/api/reputation?agent=${encodeURIComponent(p)}`), () => mockApi.reputation(p)),
  ledger: () => call("ledger", () => http("GET", "/api/ledger"), () => mockApi.ledgerAll()),
  challenge: (b) => call("challenge", () => http("POST", "/api/challenge", b), () => mockApi.challenge(b)),
  paymentProof: (b) => call("paymentProof", () => http("POST", "/api/payment-proof", b), () => mockApi.paymentProof(b)),
  feedbackIntent: (b) => call("feedbackIntent", () => http("POST", "/api/feedback/intent", b), () => mockApi.feedbackIntent(b)),
  feedback: (b) => call("feedback", () => http("POST", "/api/feedback", { feedback_intent_id: b.feedback_intent_id, auth_txid: b.auth_txid }), () => mockApi.feedback(b)),
};

/* ──────────────────────────── helpers ─────────────────────────────── */
const $ = (id) => document.getElementById(id);
const algo = (n) => `${Number(n).toFixed(2)} ALGO`;
const shortTx = (tx) => (tx ? `${tx.slice(0, 6)}…${tx.slice(-4)}` : "—");
const explorer = (tx) => (EXPLORER[NETWORK] || EXPLORER.localnet)(tx);
const explorerOn = (net, tx) => (EXPLORER[net] || EXPLORER[NETWORK] || EXPLORER.localnet)(tx);   // per-anchor network (Pera txns are testnet)
const topTag = (by_tag) => { const e = Object.entries(by_tag || {}); return e.length ? e.sort((a, b) => b[1] - a[1])[0][0] : null; };
const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let toastTimer = null;
function toast(msg, bad) {
  const t = $("toast"), m = $("toast-msg"); if (!t || !m) return;
  m.textContent = msg; t.classList.toggle("is-bad", !!bad); t.classList.add("is-shown");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("is-shown"), 3400);
}

/* loop spine (#1) */
const STEPS = ["request", "rank", "pay", "validate", "reputation", "rerun"];
function setStep(active) {
  const spine = $("loopSpine"); if (!spine) return;
  const i = STEPS.indexOf(active);
  [...spine.children].forEach((el) => {
    const si = STEPS.indexOf(el.dataset.step);
    el.classList.toggle("is-active", si === i);
    el.classList.toggle("is-done", si < i);
  });
}

/* ──────────────────────────── ui state ────────────────────────────── */
const ui = { route: null, picked: null, service_id: DEFAULT_SERVICE_ID, runs: 0, repDetail: {}, flagged: new Set(), operator: null, lastPay: null, lastPicked: null };
function flagAgent(opt) {   // #2 operator dispute on a caught agent
  if (ui.flagged.has(opt.agent_id)) return toast(`${opt.name} already flagged`);
  ui.flagged.add(opt.agent_id);
  mock.ledger.unshift({ txid: rand32(), schema: "liminal.dispute", ref_id: opt.agent_id, hash: hashHex(), round: ++mockRound, network: NETWORK });
  toast(`Dispute filed — ${opt.name} flagged for the registry.`, true);
  const card = [...$("agentList").children].find((c) => c.dataset && c.dataset.agentId === opt.agent_id);
  if (card && !card.querySelector(".agent-flag.flagged")) card.querySelector(".agent-head").insertAdjacentHTML("beforeend", '<span class="agent-flag flagged">⚑ flagged</span>');
  const fb = $("flagBtn"); if (fb) { fb.textContent = "⚑ flagged"; fb.disabled = true; }
  renderLedger();
}

/* ──────────────────────────── rendering ───────────────────────────── */
function renderAgents(route, prevById) {
  // FLIP capture (#2): record current positions by agent before clearing
  const old = {};
  [...$("agentList").children].forEach((c) => { if (c.dataset.agentId) old[c.dataset.agentId] = c.getBoundingClientRect().top; });
  ui.route = route;
  const list = $("agentList"); list.innerHTML = "";
  route.options.forEach((opt, i) => {
    const dropped = prevById && prevById[opt.agent_id] != null && opt.reputation < prevById[opt.agent_id];
    const tag = dropped ? topTag(ui.repDetail[opt.agent_id] && ui.repDetail[opt.agent_id].by_tag) : null;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "case-item agent" + (i === 0 ? " is-active" : "") + (dropped ? " is-dropped" : "");
    b.dataset.optionId = opt.option_id; b.dataset.agentId = opt.agent_id;
    b.innerHTML = `
      <div class="agent-head">
        <span class="agent-name">${opt.name}</span>
        ${dropped ? `<span class="agent-flag caught">caught${tag ? " · " + tag : ""}</span>` : ""}
        ${ui.flagged.has(opt.agent_id) ? '<span class="agent-flag flagged">⚑ flagged</span>' : ""}
        <span class="agent-rank">#${i + 1}</span>
        <span class="agent-inspect" data-act="inspect" role="button" title="Inspect reputation provenance">ⓘ</span>
      </div>
      <div class="agent-stats"><span><b>${algo(opt.price)}</b></span><span>rep <b>${opt.reputation ?? "—"}</b></span><span>trust <b>${opt.trust_score}</b></span></div>
      <div class="agent-trust"><i style="width:0%"></i></div>`;
    b.addEventListener("click", (e) => { if (e.target.closest('[data-act="inspect"]')) inspectAgent(opt); else pick(opt.option_id); });
    list.appendChild(b);
    requestAnimationFrame(() => { const f = b.querySelector(".agent-trust > i"); if (f) f.style.width = `${opt.trust_score}%`; });
  });
  (route.excluded || []).forEach((ex) => {
    const d = document.createElement("div");
    d.className = "case-item agent is-excluded";
    d.innerHTML = `<div class="agent-head"><span class="agent-name">${ex.name}</span><span class="agent-flag excluded">excluded</span></div>
      <div class="agent-excluded-note">unrated — ${ex.reason}; held out of routing</div>`;
    list.appendChild(d);
  });
  // FLIP play
  if (!reduceMotion()) [...list.children].forEach((c) => {
    const agentId = c.dataset.agentId; if (!agentId || old[agentId] == null) return;
    const dy = old[agentId] - c.getBoundingClientRect().top;
    if (!dy) return;
    c.style.transform = `translateY(${dy}px)`; c.style.transition = "none";
    requestAnimationFrame(() => { c.style.transition = "transform 520ms cubic-bezier(0.34,1.2,0.64,1)"; c.style.transform = ""; });
  });
  $("railMeta").textContent = `${route.options.length} ranked${route.excluded && route.excluded.length ? ` · ${route.excluded.length} held` : ""}`;
  pick(route.options[0].option_id, true);
}

function pick(optionId, silent) {
  ui.picked = ui.route.options.find((o) => o.option_id === optionId);
  [...$("agentList").children].forEach((c) => c.classList.toggle("is-active", c.dataset && c.dataset.optionId === optionId));
  const p = ui.picked;
  const parts = trustParts(p.price, p.reputation ?? 0, ui.route.options);
  $("slateEyebrow").innerHTML = `<span class="sb-strong">Selected agent</span> · trust-ranked pick`;
  $("slateTitle").textContent = p.name;
  $("slateSubtitle").textContent = `${algo(p.price)} · reputation ${p.reputation ?? "unrated"} · trust ${p.trust_score}/100`;

  const canvas = $("slateCanvas"); canvas.dataset.empty = "0"; canvas.classList.remove("is-collapsed");
  $("quoteWrap").innerHTML = `
    <div class="quote-card">
      <div class="qc-eyebrow">x402 quote · ${SERVICE_LABELS[p.service_id] || p.service_id}</div>
      <div class="qc-row"><span class="qc-k">Agent</span><span class="qc-v">${p.name}</span></div>
      <div class="qc-row"><span class="qc-k">Address</span><span class="qc-v">${p.agent_id.split(":").pop().slice(0, 12)}…</span></div>
      <div class="qc-row"><span class="qc-k">Quote</span><span class="qc-v accent">${algo(p.price)}</span></div>
      <div class="qc-row"><span class="qc-k">Reputation</span><span class="qc-v">${p.reputation ?? "unrated"}${p.reputation != null ? " / 100" : ""}</span></div>
      <div class="qc-breakdown" title="trust = price + earned reputation">
        <div class="qcb-label">Trust score · ${p.trust_score}/100</div>
        <div class="qcb-bar">
          <i class="qcb-price" style="width:${parts.price * 100}%"></i><i class="qcb-rep" style="width:${parts.reputation * 100}%"></i>
        </div>
        <div class="qcb-legend"><span><i class="dot price"></i>price ${Math.round(parts.price * 100)}</span><span><i class="dot rep"></i>reputation ${Math.round(parts.reputation * 100)}</span></div>
      </div>
    </div>`;

  $("metricBand").hidden = true;
  $("dispoArtifact").hidden = true;
  $("causalLine").hidden = true;
  $("summaryLine").hidden = true;
  $("briefArea").hidden = false;
  $("briefBody").innerHTML = `<span class="brief-opener"><em>${p.name}</em> leads the route at ${algo(p.price)}. Approve to settle over x402 on Algorand, then validate the delivery against this quote.</span>`;
  $("disposition").hidden = false;
  setStep("rank");
  if (!silent) toast(`Picked ${p.name}`);
}

function renderMetricBand(quoted, settled, response) {
  const band = $("metricBand"); band.hidden = false;
  const over = settled != null && quoted != null && settled > quoted + 1e-9;
  const cell = (label, val, cls, cap, capCls, cellCls) =>
    `<div class="metric-cell ${cellCls || ""}"><div class="metric-label">${label}</div><div class="metric-number ${val == null ? "pending" : cls || ""}">${val == null ? "··" : val}</div><div class="metric-caption ${capCls || ""}">${cap}</div></div>`;
  band.innerHTML =
    cell("Quoted", quoted == null ? null : quoted.toFixed(2), "", "ALGO · x402") +
    cell("Settled", settled == null ? null : settled.toFixed(2), over ? "bad" : "good", settled == null ? "settling…" : (over ? `+${(settled - quoted).toFixed(2)} quote drift` : "matches quote"), over ? "bad" : "", over ? "over" : "") +
    cell("Validation", response == null ? null : String(response), response == null ? "" : (response === 0 ? "bad" : "good"), response == null ? "validating…" : (response === 0 ? "price-vs-quote failed" : "verdict passed"), response === 0 ? "bad" : "");
}

function renderProof(pay) {
  const pop = pay.proof_of_payment; if (!pop) return "";
  const from = ui.operator ? `${ui.operator.slice(0, 4)}…${ui.operator.slice(-4)}` : pop.from;   // connected Pera wallet, when present
  return `<div class="x402-badge">◇ x402 · payment-anchored</div>
    <div class="proof"><span>from ${from}</span><span>to ${shortTx(pop.to)}</span><span>${(pop.amount / 1e6).toFixed(2)} ${pop.asset === 0 ? "ALGO" : "ASA:" + pop.asset}</span><span>round r${pop.round}</span><span>nonce ${pop.nonce}</span></div>`;
}

function renderCausal(pay, v, prevRep) {   // #3 causal "because" line
  const el = $("causalLine"); el.hidden = false;
  const over = pay.settled_amount > pay.quoted_amount + 1e-9;
  const tag = topTag(ui.repDetail[ui.picked.agent_id] && ui.repDetail[ui.picked.agent_id].by_tag);
  if (v.response < 100) {
    el.className = "causal-line bad";
    el.innerHTML = `<span class="cl-key">Reputation ${prevRep ?? "—"} → ${v.new_reputation ?? "—"}</span> <span class="cl-because">because</span> ${over ? `settled <b>${pay.settled_amount.toFixed(2)}</b> &gt; quoted <b>${pay.quoted_amount.toFixed(2)}</b> ALGO` : `validation failed`}${tag ? ` — <span class="cl-tag">${tag}</span>` : ""}.`;
  } else {
    el.className = "causal-line good";
    el.innerHTML = `<span class="cl-key">Reputation held</span> <span class="cl-because">because</span> settled matched the quote.`;
  }
}

function renderSummary(pay, v) {   // #7 counterfactual takeaway
  const el = $("summaryLine");
  if (v.response < 100) {
    const gap = (pay.settled_amount - pay.quoted_amount).toFixed(2);
    el.hidden = false;
    el.innerHTML = `Going cheapest cost <b>+${gap} ALGO</b> this time — and would route the next operation to a caught agent. <strong>Re-run</strong>: earned reputation makes the router avoid it.`;
  } else { el.hidden = true; }
}

function renderBriefVerdict(pay, v) {
  const txid = pay.txids[0];
  const over = pay.settled_amount > pay.quoted_amount + 1e-9;
  $("briefBody").innerHTML = `
    <span class="brief-opener"><em>${pay.read}</em></span>
    Validation compared the settled amount to the quote.
    ${over ? `<div class="gap-flag">⚠ settled ${pay.settled_amount.toFixed(2)} &gt; quoted ${pay.quoted_amount.toFixed(2)} ALGO — quote drift caught from chain data.</div>` : ` Settlement matched the quote.`}
    ${renderProof(pay)}
    <div class="brief-txids">settle <a class="txid-link" href="${explorer(txid)}" target="_blank" rel="noopener">${shortTx(txid)} ↗</a> · verdict <a class="txid-link" href="${explorer(v.verdict_txid)}" target="_blank" rel="noopener">${shortTx(v.verdict_txid)} ↗</a></div>`;
  $("disposition").hidden = true;
}

function renderSignedPacket(pay, v, picked, prevRep, proofMeta) {
  const over = pay.settled_amount > pay.quoted_amount + 1e-9;
  const down = prevRep != null && v.new_reputation != null && v.new_reputation < prevRep;
  const packetHash = hashHex(40);
  const art = $("dispoArtifact"); art.hidden = false;
  let proofSection = "";
  if (proofMeta && proofMeta.challenge) {
    const ch = proofMeta.challenge, pr = proofMeta.proof || {}, st = proofMeta.settle || {};
    const net = st.network || NETWORK;
    const evidenceTxid = pr.validation_txid || pr.ledger_txid || "";
    const evidenceKind = pr.validation_txid ? "on-chain ValidationRegistry" : (pr.ledger_txid ? "hash-only anchor" : "—");
    const payTo = ch.pay_to || "";
    proofSection = `
      <div class="da-section da-proof">
        <div class="da-label">Direct payment proof · x402</div>
        <div class="da-text">
          <div class="pp-row"><span class="pp-k">agent wallet</span><code class="copyable" data-copy="${payTo}">${shortTx(payTo)}</code></div>
          <div class="pp-row"><span class="pp-k">x402 nonce</span><code>${ch.nonce ?? "—"}</code></div>
          <div class="pp-row"><span class="pp-k">note binds challenge</span><code>✓ ${ch.challenge_id}</code></div>
          <div class="pp-row"><span class="pp-k">payment</span><a class="txid-link" href="${explorerOn(net, pay.txids[0])}" target="_blank" rel="noopener">${shortTx(pay.txids[0])} ↗</a> <span class="pp-tag ${st.real ? "real" : ""}">${st.real ? "Pera · verified on-chain" : "demo settle"}</span></div>
          <div class="pp-row"><span class="pp-k">policy</span><code class="${pr.quote_drift ? "bad" : "good"}">${pr.policy_result || (pr.quote_drift ? "quote_drift" : "fair")}</code></div>
          <div class="pp-row"><span class="pp-k">validation evidence</span>${evidenceTxid ? `<a class="txid-link" href="${explorerOn(net, evidenceTxid)}" target="_blank" rel="noopener">${shortTx(evidenceTxid)} ↗</a> <span class="pp-tag">${evidenceKind}</span>` : "—"}</div>
        </div>
      </div>`;
  }
  art.innerHTML = `
    <div class="da-bar"><span class="da-stamp">${over ? "Contested" : "Settled"}</span><span class="da-title">${picked.name} · validated</span><span class="da-time">${NETWORK}</span></div>
    <div class="da-body">
      <div class="da-section"><div class="da-label">Disposition</div><div class="da-text">Quoted <em>${pay.quoted_amount.toFixed(2)}</em> → charged <em>${pay.settled_amount.toFixed(2)}</em> ALGO</div></div>
      <div class="da-section"><div class="da-label">Verdict</div><div class="da-text">${v.price_match ? "price match" : "price-vs-quote FAILED"} · response ${v.response}/100</div></div>
      <div class="da-section"><div class="da-label">Reputation</div><div class="da-text"><span class="rep-line"><span class="rep-from">${prevRep ?? "—"}</span>→<span class="rep-to ${down ? "down" : "up"}">${v.new_reputation ?? "—"}</span></span></div></div>
      ${proofSection}
      <div class="da-section"><div class="da-label">Committed to ledger</div><div class="da-text">${pay.txids.length + 1} anchors · hash-only</div></div>
    </div>
    <div class="da-foot">
      <div class="da-hash"><span class="da-hash-label">SHA-256</span><code class="copyable" data-copy="${packetHash}" title="click to copy">${packetHash}</code></div>
      <div class="da-handoff">${proofMeta ? `<button class="dispo-btn da-handoff-btn da-review" id="reviewBtn">✓ Leave verified review</button>` : ""}${(over || v.response < 100) ? `<button class="dispo-btn da-handoff-btn da-flag" id="flagBtn">⚑ Flag agent</button>` : ""}${(window.WALLET && window.WALLET.isConnected) ? `<button class="dispo-btn da-handoff-btn da-pera" id="peraSignBtn">⚿ Sign on TestNet (Pera)</button>` : ""}<button class="dispo-btn da-handoff-btn" id="rerunBtn">↻ Re-run request</button><a class="dispo-btn da-handoff-btn" href="${explorer(v.verdict_txid)}" target="_blank" rel="noopener">View on explorer ›</a></div>
    </div>`;
  $("rerunBtn").addEventListener("click", () => doRoute(true));
  if ($("flagBtn")) $("flagBtn").addEventListener("click", () => flagAgent(picked));
  if ($("peraSignBtn")) $("peraSignBtn").addEventListener("click", peraSettleOnChain);
  if ($("reviewBtn")) $("reviewBtn").addEventListener("click", () => fileVerifiedReview(picked));
}

// Real operator signature: sign a 0-ALGO self-anchor on TestNet via Pera carrying the
// settlement reference, then add the real txid to the ledger. Self-contained — it proves
// the operator wallet authorized this settlement without touching the backend pay lane.
async function peraSettleOnChain() {
  const w = window.WALLET, pay = ui.lastPay, picked = ui.lastPicked;
  if (!w || !w.isConnected || !pay) return;
  const btn = $("peraSignBtn"); if (btn) { btn.disabled = true; btn.textContent = "⚿ awaiting Pera signature…"; }
  try {
    const note = `liminal/x402 settle ${pay.payment_id} ${picked.agent_id} ${pay.settled_amount.toFixed(2)} ALGO`;
    const r = await w.payment({ to: w.account, amountAlgo: 0, note });   // 0-ALGO self-anchor — real TestNet txn
    mock.ledger.unshift({ txid: r.txid, schema: "x402.settle.pera", ref_id: pay.payment_id, hash: hashHex(), round: ++mockRound, network: r.network });
    await renderLedger();
    if (btn) { btn.textContent = "⚿ signed on TestNet ✓"; btn.parentElement.insertAdjacentHTML("beforeend", `<a class="dispo-btn da-handoff-btn" href="${r.explorer}" target="_blank" rel="noopener">Pera txn ↗</a>`); }
    toast(`Operator signature anchored on TestNet · ${shortTx(r.txid)}`);
  } catch (e) {
    toast(`Pera signing failed: ${e.message}`, true);
    if (btn) { btn.disabled = false; btn.textContent = "⚿ Sign on TestNet (Pera)"; }
  }
}

// Payment-backed feedback — verified payer files one review per proof (/api/feedback/intent +
// /api/feedback). Pera 0-ALGO self-auth when connected, demo auth otherwise. Best-effort; never blocks.
async function fileVerifiedReview(picked) {
  const ch = ui.lastChallenge, pay = ui.lastPay, settle = ui.lastSettle;
  if (!ch || !pay) return;
  if (ui.reviewed) return toast("Already reviewed — one review per payment proof.");
  const btn = $("reviewBtn"); if (btn) { btn.disabled = true; btn.textContent = "✓ filing verified review…"; }
  try {
    const response = 100;   // satisfied (demo)
    const payer = (settle && settle.payer) || ui.operator || OPERATOR_WALLET;
    const intent = await api.feedbackIntent({ challenge_id: ch.challenge_id, payment_txid: pay.txids[0], payer, response });
    let auth_txid = rand32();
    const w = window.WALLET;
    if (w && w.isConnected && typeof w.payment === "function" && intent.note) {
      try { const r = await w.payment({ to: w.account, amountAlgo: 0, note: intent.note }); auth_txid = r.txid; } catch (_) { /* fall back to demo auth */ }
    }
    const fb = await api.feedback({ feedback_intent_id: intent.feedback_intent_id, auth_txid, agent_id: ch.agent_id, response });
    ui.reviewed = true;
    await renderLedger();
    await loadRepDetail(ui.route); renderRegistry();
    if (btn) { btn.textContent = "✓ verified review filed"; }
    toast(`Verified review filed · reputation ${fb.new_reputation ?? "—"} · one review per proof.`);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = "✓ Leave verified review"; }
    toast(`Review failed: ${e.message}`, true);
  }
}

function renderRegistry(prevScores) {
  const opts = (ui.route && ui.route.options) || [];
  const excl = (ui.route && ui.route.excluded) || [];
  const list = $("registryList"); list.innerHTML = "";
  [...opts.map((o) => ({ id: o.agent_id, name: o.name })), ...excl.map((e) => ({ id: e.agent_id, name: e.name, excluded: true }))].forEach((r) => {
    const d = ui.repDetail[r.id] || null;
    const score = d ? d.score : null;
    const reads = d ? d.reads_logged : 0, corr = d ? d.corrections_logged : 0;
    const tag = d ? topTag(d.by_tag) : null;
    const prev = prevScores ? prevScores[r.id] : undefined;
    const delta = prev != null && score != null ? score - prev : 0;
    const caught = delta < 0;
    const row = document.createElement("div");
    row.className = "reg-row" + (caught ? " is-caught" : "") + (r.excluded ? " is-excluded" : "");
    row.innerHTML = `
      <div class="rr-head"><span class="rr-name">${r.name}</span>
        <span>${score == null ? '<span class="rr-score unrated">unrated</span>' : `<span class="rr-score ${caught ? "down" : ""}">${score}</span>${delta < 0 ? `<span class="rr-delta down">${delta}</span>` : ""}`}</span></div>
      <div class="rr-bar"><i style="width:0%"></i></div>
      <div class="rr-agent">${r.excluded ? "no validated history" : `<span class="rr-verified">✓ ${reads} paid reviews</span> · ${corr} corrections${tag ? ` · <span class="rr-tag">${tag}</span>` : ""}`}</div>`;
    list.appendChild(row);
    if (score != null) requestAnimationFrame(() => { const f = row.querySelector(".rr-bar > i"); if (f) f.style.width = `${score}%`; });
  });
}

async function loadRepDetail(route) {
  const ids = [...route.options.map((o) => o.agent_id), ...((route.excluded || []).map((e) => e.agent_id))];
  ui.repDetail = {};
  await Promise.all(ids.map(async (id) => { ui.repDetail[id] = await api.reputation(id); }));
}

async function renderLedger() {
  const { anchors } = await api.ledger();
  ui.anchors = anchors;
  $("ledgerCount").textContent = anchors.length;
  $("auditRows").innerHTML = anchors.slice(0, 6).map((a, i) =>
    `<button class="ar-row" data-anchor="${i}"><span class="ar-time">r${a.round}</span><span class="ar-event ${isFeeSchema(a.schema) ? "refused" : ""}">${schemaLabel(a.schema)} ${shortTx(a.txid)}</span></button>`).join("");
  [...$("auditRows").children].forEach((el) => el.addEventListener("click", () => openLedger(+el.dataset.anchor)));
}

function modal(eyebrow, title, html) {   // generic modal (ledger + agent inspect)
  $("ledgerModalEyebrow").textContent = eyebrow;
  $("ledgerModalTitle").textContent = title;
  $("ledgerModalBody").innerHTML = html;
  $("ledgerModal").classList.add("is-open");
}
function openLedger(focusIdx) {   // #5 explorable ledger
  const anchors = ui.anchors || [];
  const html = anchors.length ? anchors.map((a, i) => `
    <div class="lm-row ${i === focusIdx ? "is-focus" : ""}">
      <div class="lm-top"><span class="lm-schema">${schemaLabel(a.schema)}</span><span class="lm-round">round r${a.round} · ${a.network}</span></div>
      <div class="lm-mean">${SCHEMA_MEANING[a.schema] || "anchored record"} <span class="lm-raw">· schema ${a.schema}</span></div>
      <div class="lm-kv"><span>ref</span><code class="copyable" data-copy="${a.ref_id}">${a.ref_id}</code></div>
      <div class="lm-kv"><span>hash</span><code class="copyable" data-copy="${a.hash}">${a.hash}</code></div>
      <div class="lm-kv"><span>txid</span><a class="txid-link" href="${explorerOn(a.network, a.txid)}" target="_blank" rel="noopener">${a.txid} ↗</a> <span class="copy-ic copyable" data-copy="${a.txid}">⧉</span></div>
    </div>`).join("") : `<p class="panel-placeholder">No anchors yet.</p>`;
  modal("On-chain ledger · hash-only · verifiable by anyone", "Anchored records", html);
}
async function inspectAgent(opt) {   // JTBD#3 click-in: reputation provenance from the router
  const d = ui.repDetail[opt.agent_id] || await api.reputation(opt.agent_id) || {};
  const parts = trustParts(opt.price, opt.reputation ?? 0, ui.route.options);
  const tag = topTag(d.by_tag);
  modal("Reputation provenance · ERC-8004-shaped", opt.name, `
    <p class="lm-mean">Reputation = how this agent's reads survive on-chain validation. Earned from paid reviews, not self-reported.</p>
    <div class="lm-kv"><span>agent</span><code class="copyable" data-copy="${opt.agent_id}">${opt.agent_id}</code></div>
    <div class="lm-kv"><span>score</span><code>${d.score ?? opt.reputation ?? "unrated"}${(d.score ?? opt.reputation) != null ? " / 100" : ""}</code></div>
    <div class="lm-kv"><span>paid reviews</span><code>${d.reads_logged ?? "—"}</code></div>
    <div class="lm-kv"><span>corrections</span><code>${d.corrections_logged ?? "—"}${tag ? ` · ${tag}` : ""}</code></div>
    <div class="lm-kv"><span>quote</span><code>${algo(opt.price)}</code></div>
    <div class="lm-sub">trust score · ${opt.trust_score}/100</div>
    <div class="qcb-bar"><i class="qcb-price" style="width:${parts.price * 100}%"></i><i class="qcb-rep" style="width:${parts.reputation * 100}%"></i></div>
    <div class="qcb-legend"><span><i class="dot price"></i>price ${Math.round(parts.price * 100)}</span><span><i class="dot rep"></i>reputation ${Math.round(parts.reputation * 100)}</span></div>
    ${d.uri ? `<div class="lm-kv" style="margin-top:10px"><span>off-chain uri</span><code class="copyable" data-copy="${d.uri}">${d.uri}</code></div>` : ""}`);
}
function closeLedger() { $("ledgerModal").classList.remove("is-open"); }
function copy(text) { try { navigator.clipboard.writeText(text); toast("copied to clipboard"); } catch (_) { toast("copy failed", true); } }

function renderReceipt() {
  const r = $("frameReceipt"); if (!r) return;
  r.innerHTML = `<span class="fr-glyph">◇</span><span class="fr-strong">route · ${ui.route ? ui.route.route_id : "—"}</span><span class="fr-sep">·</span><span>${ui.route ? ui.route.options.length : 0} agents</span><span class="fr-sep">·</span><span>${NETWORK} · ${ANY_LIVE ? "live" : "mock"}</span><span class="fr-right">R route · A approve · P present · ⌘. tray</span>`;
}
function renderSrc() {   // #13 per-endpoint source indicator + server health
  const el = $("srcMode"); if (!el) return;
  const live = Object.values(srcMode).filter((s) => s === "live").length;
  const fb = Object.values(srcMode).filter((s) => s === "fallback").length;
  const dot = !ANY_LIVE ? "○ mock" : serverUp ? "● server online" : "○ server offline";
  el.textContent = `${dot}${live ? ` · ${live} live` : ""}${fb ? ` · ${fb} fallback` : ""}`;
  el.className = "sm-src" + (ANY_LIVE && serverUp ? " is-up" : " has-fallback");
  el.title = "click to re-check the router-server";
}

/* ─────────────────────────── flow control ─────────────────────────── */
async function doRoute(isRerun) {
  $("routeBtn").disabled = true; const rb = $("rerunBtn"); if (rb) rb.disabled = true;
  setStep(isRerun ? "rerun" : "request");
  if (ANY_LIVE && !serverUp) await probe();   // reconnect if the server came online
  try {
    const prevById = isRerun && ui.route ? Object.fromEntries(ui.route.options.map((o) => [o.agent_id, o.reputation])) : null;
    const route = await api.route({ task: ($("taskInput").value || "").trim() || SERVICE_TASKS[ui.service_id], service_id: ui.service_id });
    ui.runs += 1;
    $("breadcrumb").textContent = `${SERVICE_LABELS[ui.service_id] || ui.service_id} route`; $("crumb-sep").hidden = false;
    await loadRepDetail(route);
    if (isRerun && prevById) {
      const top = route.options[0];
      const dropped = route.options.find((o) => prevById[o.agent_id] != null && o.reputation < prevById[o.agent_id]);
      const held = !dropped && (route.excluded || []).find((o) => prevById[o.agent_id] != null);
      $("classification").textContent = dropped
        ? `REROUTED · ${dropped.name} dropped to #${route.options.indexOf(dropped) + 1} · ${top.name} now leads`
        : held
          ? `REROUTED · ${held.name} held out · ${top.name} now leads`
        : `RE-RANKED · ${top.name} leads`;
      if (dropped || held) toast(`Rerouted: ${(dropped || held).name} dropped after validation — ${top.name} now leads.`);
    } else {
      $("classification").textContent = `ROUTE · ${(SERVICE_LABELS[ui.service_id] || ui.service_id).toUpperCase()} · ${NETWORK.toUpperCase()}`;
    }
    renderAgents(route, prevById);
    renderRegistry(prevById);
    await renderLedger();
    renderReceipt();
  } catch (e) {
    toast(`Route failed: ${e.message}`, true);
  } finally {
    $("routeBtn").disabled = false;
  }
}

async function settleChallenge(ch) {
  // The client pays the selected agent's wallet directly for the x402 challenge amount, bound by
  // the challenge payment_note. Default = demo settle (no real spend) so the loop is safe offline;
  // the explicit Pera action does the real, on-chain, no-custody vendor payment.
  return { txid: rand32(), payer: ui.operator || OPERATOR_WALLET, real: false, network: NETWORK };
}

// Proof path: forward the agent's x402 challenge → pay the agent wallet → submit payment proof.
// Reuses the existing render sequence; falls back to the legacy pay/validate loop on any failure so
// the demo can never break. Consumes Reza/Shayaun's /api/challenge + /api/payment-proof.
async function doApprove() {
  if (!ui.route || !ui.picked) return;
  const picked = ui.picked, prevRep = picked.reputation;
  $("dispoPrimary").disabled = true; $("dispoDefer").disabled = true;
  $("slateCanvas").setAttribute("aria-busy", "true");
  setStep("pay");
  renderMetricBand(picked.price, null, null);
  $("briefBody").innerHTML = `<span class="brief-opener">Forwarding the x402 challenge for <em>${picked.name}</em>…</span>`;
  $("disposition").hidden = true;
  try {
    const ch = await api.challenge({ route_id: ui.route.route_id, option_id: picked.option_id });
    const quoted = (ch.quote && ch.quote.amount != null) ? ch.quote.amount : picked.price;
    const charge = ch.amount;
    const over = charge > quoted + 1e-9;                          // the cheat — execution 402 exceeds the quote
    renderMetricBand(quoted, charge, null);
    $("metricBand").scrollIntoView({ behavior: "smooth", block: "nearest" });
    $("briefBody").innerHTML = `<span class="brief-opener">Paying ${algo(charge)} to <em>${picked.name}</em>'s wallet over x402…</span>`;
    if (over) await wait(BEAT);
    const settle = await settleChallenge(ch);
    setStep("validate");
    const proof = await api.paymentProof({ challenge_id: ch.challenge_id, txid: settle.txid, payer: settle.payer });
    const v = {
      validation_id: proof.validation_id || `val_${mock.seq}`,
      price_match: !proof.quote_drift,
      output_pass: null,
      response: proof.quote_drift ? 0 : 100,
      new_reputation: proof.new_reputation,
      verdict_txid: proof.validation_txid || proof.ledger_txid || settle.txid,
    };
    const pay = {
      payment_id: ch.challenge_id, agent_id: ch.agent_id, quote_id: ch.quote_id, txids: [settle.txid],
      quoted_amount: quoted, settled_amount: charge,
      read: over ? "Delivered read (x402 charge exceeded the quote)." : "Delivered read.",
      proof_of_payment: { from: settle.payer, to: ch.pay_to, asset: 0, amount: Math.round(charge * 1e6), txid: settle.txid, round: mockRound, nonce: ch.nonce },
    };
    ui.lastPay = pay; ui.lastPicked = picked; ui.lastChallenge = ch; ui.lastProof = proof; ui.lastSettle = settle; ui.reviewed = false;
    renderMetricBand(quoted, charge, v.response);
    $("slateCanvas").classList.add("is-collapsed");          // #10 progressive disclosure
    renderBriefVerdict(pay, v);
    renderSignedPacket(pay, v, picked, prevRep, { challenge: ch, proof, settle });
    renderSummary(pay, v);
    await loadRepDetail(ui.route);
    if (over) await wait(BEAT);
    renderCausal(pay, v, prevRep);
    renderRegistry({ [picked.agent_id]: prevRep });
    await renderLedger();
    setStep("reputation");
    renderReceipt();
    toast(v.response === 0 ? `${picked.name} charged above quote — reputation ${prevRep ?? "—"}→${v.new_reputation ?? "—"}, anchored.` : `${picked.name} validated — reputation held.`, v.response === 0);
  } catch (e) {
    console.warn("proof path failed; falling back to pay/validate", e);
    try { await doApproveLegacy(picked, prevRep); }
    catch (e2) { toast(`Payment/validation failed: ${e2.message}`, true); $("disposition").hidden = false; }
  } finally {
    $("dispoPrimary").disabled = false; $("dispoDefer").disabled = false;
    $("slateCanvas").removeAttribute("aria-busy");
  }
}

// Legacy router-settled loop — kept verbatim as the guaranteed fallback for the proof path above.
async function doApproveLegacy(picked, prevRep) {
  setStep("pay");
  renderMetricBand(picked.price, null, null);
  const pay = await api.pay({ route_id: ui.route.route_id, option_id: picked.option_id });
  ui.lastPay = pay; ui.lastPicked = picked;
  const over = pay.settled_amount > pay.quoted_amount + 1e-9;
  renderMetricBand(pay.quoted_amount, pay.settled_amount, null);
  $("metricBand").scrollIntoView({ behavior: "smooth", block: "nearest" });
  if (over) await wait(BEAT);
  setStep("validate");
  const v = await api.validate({ payment_id: pay.payment_id });
  renderMetricBand(pay.quoted_amount, pay.settled_amount, v.response);
  $("slateCanvas").classList.add("is-collapsed");
  renderBriefVerdict(pay, v);
  renderSignedPacket(pay, v, picked, prevRep);
  renderSummary(pay, v);
  await loadRepDetail(ui.route);
  if (over) await wait(BEAT);
  renderCausal(pay, v, prevRep);
  renderRegistry({ [picked.agent_id]: prevRep });
  await renderLedger();
  setStep("reputation");
  renderReceipt();
  toast(v.response === 0 ? `${picked.name} charged above quote — reputation ${prevRep ?? "—"}→${v.new_reputation ?? "—"}, anchored.` : `${picked.name} validated — reputation held.`, v.response === 0);
}

function doDeny() { $("briefArea").hidden = true; toast("Denied — no settlement."); }

/* scenario chips (#4) */
function runScenario(serviceId, task) {
  const tab = [...document.querySelectorAll(".reg-tab")].find((t) => t.dataset.serviceId === serviceId);
  if (tab) { document.querySelectorAll(".reg-tab").forEach((t) => t.classList.remove("is-active")); tab.classList.add("is-active"); }
  ui.service_id = serviceId; $("taskInput").value = task; setBanner(); doRoute(false);
}

/* ───────────────────────────── wire up ────────────────────────────── */
function boot() {
  $("routeBtn").addEventListener("click", () => doRoute(false));
  $("dispoPrimary").addEventListener("click", doApprove);
  $("dispoDefer").addEventListener("click", doDeny);
  $("taskInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doRoute(false); } });

  [...document.querySelectorAll(".scenario-chip")].forEach((c) => c.addEventListener("click", () => runScenario(c.dataset.serviceId, c.dataset.task)));

  [...document.querySelectorAll(".reg-tab")].forEach((tab) => tab.addEventListener("click", () => {
    if (tab.classList.contains("is-active")) return;
    document.querySelectorAll(".reg-tab").forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    ui.service_id = tab.dataset.serviceId; $("taskInput").value = SERVICE_TASKS[ui.service_id] || ""; setBanner(); doRoute(false);
  }));

  const pill = $("tray-pill"), stage = document.querySelector(".stage");
  if (pill && stage) pill.addEventListener("click", () => stage.classList.toggle("tray-open"));
  $("ledgerPill").addEventListener("click", () => openLedger(-1));
  $("ledgerModalClose").addEventListener("click", closeLedger);
  $("ledgerModal").addEventListener("click", (e) => { if (e.target.id === "ledgerModal") closeLedger(); });
  $("presentToggle").addEventListener("click", () => document.body.classList.toggle("present"));

  // keyboard (#12)
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,textarea")) return;
    if (e.key === "Escape") closeLedger();
    else if (e.key === "r" || e.key === "R") doRoute(false);
    else if (e.key === "a" || e.key === "A") { if (!$("disposition").hidden) doApprove(); }
    else if (e.key === "p" || e.key === "P") document.body.classList.toggle("present");
    else if (e.key === "." && (e.metaKey || e.ctrlKey)) { e.preventDefault(); stage.classList.toggle("tray-open"); }
  });

  // JTBD#4 — click any address/txid/hash to copy
  document.addEventListener("click", (e) => { const c = e.target.closest("[data-copy]"); if (c) { e.preventDefault(); copy(c.dataset.copy); } });

  $("srcMode").addEventListener("click", () => probe().then((up) => toast(up ? "router-server online :3001" : "router-server offline — using mock", !up)));
  setBanner(); setStep("request"); renderReceipt(); renderSrc();
  probe();   // health check on boot; gates live calls + updates the indicator
  requestAnimationFrame(() => document.body.classList.add("ready"));
}
function setBanner() { $("netBanner").textContent = `ALGORAND · ${NETWORK.toUpperCase()} · ${!ANY_LIVE ? "MOCK" : serverUp ? "LIVE :3001" : "SERVER OFFLINE"}`; renderChainCtx(); }
function renderChainCtx() {
  const el = $("chainCtx"); if (!el) return;
  const live = ANY_LIVE && serverUp;
  const modeClass = !ANY_LIVE ? "is-mock" : serverUp ? "is-live" : "is-offline";
  const modeLabel = !ANY_LIVE ? "MOCK" : serverUp ? "LIVE" : "OFFLINE";
  const appRow = (label, id) => `<div class="cc-app"><span>${label}</span><a class="cc-link" href="${EXPLORER_APP(id)}" target="_blank" rel="noopener" title="app ${id} · open in explorer">app ${id}</a></div>`;
  el.innerHTML = `
    <div class="cc-net cc-${NETWORK} ${modeClass}"><span class="cc-dot"></span>ALGORAND · ${NETWORK.toUpperCase()} <span class="cc-mode">${modeLabel}</span></div>
    <div class="cc-apps">
      ${appRow("Reputation", REGISTRY_APPS.reputation)}
      ${appRow("Identity", REGISTRY_APPS.identity)}
      <div class="cc-app"><span>settlement</span><code>${live ? "x402 · live" : "x402 · note anchor"}</code></div>
    </div>`;
}

/* ── Pera wallet → operator wallet ──────────────────────────────────── */
let peraActiveR = false;
function applyPeraOperator() {
  const w = window.WALLET; if (!w) return;
  if (w.account) { peraActiveR = true; ui.operator = w.account; }
  else if (peraActiveR) { peraActiveR = false; ui.operator = null; }
  else return;
  const kind = w.isLocal ? "Demo wallet" : "Pera";
  toast(w.account ? `${kind} connected · agent ${w.account.slice(0, 4)}…${w.account.slice(-4)}` : `${kind} disconnected`);
}
window.addEventListener("wallet:change", applyPeraOperator);
window.addEventListener("wallet:ready", applyPeraOperator);
window.addEventListener("wallet:error", (e) => toast((e.detail && e.detail.message) || "Pera wallet error", true));

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
