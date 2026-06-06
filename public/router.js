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
const LIVE = { route: true, pay: true, validate: true, reputation: true, ledger: true };
const ANY_LIVE = Object.values(LIVE).some(Boolean);
const NETWORK  = "localnet";
const TRUST_WEIGHTS = { price: 0.3, reputation: 0.4, validation: 0.3 };
const MOCK_LATENCY = { route: 260, pay: 460, validate: 620 };
const EXPLORER = {
  localnet: (tx) => `https://lora.algokit.io/localnet/transaction/${tx}`,
  testnet:  (tx) => `https://lora.algokit.io/testnet/transaction/${tx}`,
  mainnet:  (tx) => `https://lora.algokit.io/mainnet/transaction/${tx}`,
};
const REGISTER_TASKS = {
  Diligence:  "Diligence read: partner email says rejected; dashboard says in-review",
  Outreach:   "Draft a follow-up to the warm intro from last week",
  Judgment:   "Verdict: is this LOI worth countersigning as written?",
  Operations: "Reconcile the June invoice batch against the ledger",
};
// #4 — friendly, on-pitch labels for both the UI mock schemas AND the live
// server schemas (Navid anchors `payment-v1`; reputation anchors `algorand-rep-v1`)
// so the live ledger reads the same as the demo narrative.
const SCHEMA_MEANING = {
  "x402.settle": "the x402 payment settlement (quoted amount)",
  "x402.settle.fee": "the second settlement — the hidden fee charged above quote",
  "erc8004.feedback": "the validation verdict feeding the agent's reputation",
  "payment-v1": "the x402 payment settlement, anchored hash-only on Algorand",
  "algorand-rep-v1": "the reputation feedback entry (ERC-8004-shaped)",
  "liminal.dispute": "an operator dispute filed against a caught agent",
};
const SCHEMA_LABEL = {
  "x402.settle": "x402 settle", "x402.settle.fee": "hidden fee", "erc8004.feedback": "verdict",
  "payment-v1": "x402 settle", "algorand-rep-v1": "reputation", "liminal.dispute": "dispute",
};
const schemaLabel = (s) => SCHEMA_LABEL[s] || s;
const isFeeSchema = (s) => s.includes("fee");

/* ──────────────────────── mock backend state ──────────────────────── */
const mock = {
  seq: 0, routes: new Map(), payments: new Map(), ledger: [],
  providers: [
    pv("Helios Diligence",   "Diligence",  0.38, 20, 3,  0.97, 0.92, false),
    pv("Borealis Analytics", "Diligence",  0.34, 20, 5,  0.95, 0.86, false),
    pv("Vega Quotes",        "Diligence",  0.30, 8,  1,  0.90, 0.55, true),
    pv("Nimbus Newcomer",    "Diligence",  0.28, 0,  0,  0.00, 0.50, false),
    pv("Comet Outreach",     "Outreach",   0.20, 15, 2,  0.93, 0.88, false),
    pv("Orion Drafts",       "Outreach",   0.26, 18, 6,  0.90, 0.70, true),
    pv("Arbiter Prime",      "Judgment",   0.50, 30, 4,  0.98, 0.91, false),
    pv("Verdict Labs",       "Judgment",   0.42, 22, 7,  0.92, 0.74, true),
    pv("Atlas Ops",          "Operations", 0.18, 25, 3,  0.96, 0.89, false),
    pv("Forge Runners",      "Operations", 0.24, 12, 5,  0.88, 0.66, true),
  ],
};
function pv(name, register, price, reads, corrections, validation_rate, quality, dishonest) {
  const addr = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 16).padEnd(16, "X");
  return { id: `algorand:${NETWORK}:${addr}`, name, register, price, reads, corrections,
           by_tag: corrections > 0 ? { quality_drift: corrections } : {}, validation_rate, quality, dishonest };
}
const scoreOf = (p) => (p.reads > 0 ? Math.round(100 * (p.reads - p.corrections) / p.reads) : null);
const rand32 = (n = 52) => { const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let s = ""; for (let i = 0; i < n; i++) s += a[(Math.random() * 32) | 0]; return s; };
const hashHex = (n = 64) => { const a = "0123456789abcdef"; let s = ""; for (let i = 0; i < n; i++) s += a[(Math.random() * 16) | 0]; return s; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let mockRound = 41000000 + ((Math.random() * 1000) | 0);

function trustParts(price, reputation, validation_rate, all) {
  const prices = all.map((x) => x.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const priceScore = max === min ? 1 : (max - price) / (max - min);
  return {
    price: priceScore * TRUST_WEIGHTS.price,
    reputation: (reputation / 100) * TRUST_WEIGHTS.reputation,
    validation: validation_rate * TRUST_WEIGHTS.validation,
  };
}
const trustScore = (price, rep, val, all) => { const p = trustParts(price, rep, val, all); return p.price + p.reputation + p.validation; };

const mockApi = {
  async route({ task, register }) {
    await wait(MOCK_LATENCY.route);
    const inReg = mock.providers.filter((p) => p.register === register);
    const ranked = inReg.filter((p) => scoreOf(p) != null && scoreOf(p) > 0);
    const excluded = inReg.filter((p) => scoreOf(p) == null || scoreOf(p) === 0)
      .map((p) => ({ provider_id: p.id, name: p.name, reason: "no validated history" }));
    const scored = ranked.map((p) => ({ p, t: trustScore(p.price, scoreOf(p), p.validation_rate, ranked) }));
    const sum = scored.reduce((a, s) => a + s.t, 0) || 1;
    const options = scored.map(({ p, t }) => ({
      option_id: `opt_${p.id.split(":").pop().slice(0, 6)}`,
      provider_id: p.id, name: p.name, price: p.price, reputation: scoreOf(p),
      validation_rate: p.validation_rate,
      trust_score: Math.round(t * 1000) / 10, weight: Math.round((t / sum) * 1000) / 10,
    })).sort((a, b) => b.trust_score - a.trust_score);
    const route_id = `rt_${++mock.seq}`;
    mock.routes.set(route_id, { task, register, options });
    return { route_id, task, register, options, excluded };
  },
  async pay({ route_id, option_id }) {
    await wait(MOCK_LATENCY.pay);
    const route = mock.routes.get(route_id);
    const opt = route && route.options.find((o) => o.option_id === option_id);
    if (!opt) { const e = new Error("unknown route/option"); e.status = 400; throw e; }
    const prov = mock.providers.find((p) => p.id === opt.provider_id);
    const quoted = opt.price;
    const hiddenFee = prov.dishonest ? Math.round(quoted * 0.82 * 100) / 100 : 0;
    const settled = Math.round((quoted + hiddenFee) * 100) / 100;
    const txids = [rand32()]; if (hiddenFee > 0) txids.push(rand32());
    const payment_id = `pay_${++mock.seq}`;
    const nonce = (Math.random() * 1e6) | 0;
    mock.payments.set(payment_id, { route_id, option_id, provider_id: opt.provider_id, quoted, settled, dishonest: prov.dishonest });
    txids.forEach((tx, i) => mock.ledger.unshift({ txid: tx, schema: i === 0 ? "x402.settle" : "x402.settle.fee", ref_id: payment_id, hash: hashHex(), round: ++mockRound, network: NETWORK }));
    return {
      payment_id, txids, quoted_amount: quoted, settled_amount: settled,
      read: prov.dishonest ? "Delivered read (charged above quote)." : "Delivered read.",
      proof_of_payment: { from: "OPERATOR…WALLET", to: prov.id.split(":").pop(), asset: 0, amount: Math.round(settled * 1e6), txid: txids[0], round: mockRound, nonce },
    };
  },
  async validate({ payment_id }) {
    await wait(MOCK_LATENCY.validate);
    const pay = mock.payments.get(payment_id);
    if (!pay) { const e = new Error("unknown payment"); e.status = 400; throw e; }
    const prov = mock.providers.find((p) => p.id === pay.provider_id);
    const price_match = pay.settled <= pay.quoted + 1e-9;
    const output_pass = prov.quality >= 0.6;
    const response = !price_match ? 0 : (output_pass ? 100 : 60);
    if (response < 100) {
      prov.reads += 1; prov.corrections += 1;
      const tag = !price_match ? "missed_compensation" : "quality_drift";
      prov.by_tag[tag] = (prov.by_tag[tag] || 0) + 1;
      prov.validation_rate = Math.max(0.05, Math.round(prov.validation_rate * 0.33 * 100) / 100);
    } else { prov.reads += 1; prov.validation_rate = Math.min(0.99, Math.round((prov.validation_rate + 0.01) * 100) / 100); }
    const verdict_txid = rand32();
    mock.ledger.unshift({ txid: verdict_txid, schema: "erc8004.feedback", ref_id: payment_id, hash: hashHex(), round: ++mockRound, network: NETWORK });
    return { validation_id: `val_${++mock.seq}`, price_match, output_pass, response, new_reputation: scoreOf(prov), verdict_txid };
  },
  async reputation(provider) {
    const p = mock.providers.find((x) => x.id === provider);
    if (!p) return null;
    return { provider_id: p.id, score: scoreOf(p), reads_logged: p.reads, corrections_logged: p.corrections, by_tag: p.by_tag, uri: `liminal://corrections/${p.id}`, hash: hashHex() };
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
  reputation: (p) => call("reputation", () => http("GET", `/api/reputation?provider=${encodeURIComponent(p)}`), () => mockApi.reputation(p)),
  ledger: () => call("ledger", () => http("GET", "/api/ledger"), () => mockApi.ledgerAll()),
};

/* ──────────────────────────── helpers ─────────────────────────────── */
const $ = (id) => document.getElementById(id);
const algo = (n) => `${Number(n).toFixed(2)} ALGO`;
const shortTx = (tx) => (tx ? `${tx.slice(0, 6)}…${tx.slice(-4)}` : "—");
const explorer = (tx) => (EXPLORER[NETWORK] || EXPLORER.localnet)(tx);
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
const ui = { route: null, picked: null, register: "Diligence", runs: 0, repDetail: {}, flagged: new Set() };
function flagProvider(opt) {   // #2 operator dispute on a caught provider
  if (ui.flagged.has(opt.provider_id)) return toast(`${opt.name} already flagged`);
  ui.flagged.add(opt.provider_id);
  mock.ledger.unshift({ txid: rand32(), schema: "liminal.dispute", ref_id: opt.provider_id, hash: hashHex(), round: ++mockRound, network: NETWORK });
  toast(`Dispute filed — ${opt.name} flagged for the registry.`, true);
  const card = [...$("providerList").children].find((c) => c.dataset && c.dataset.providerId === opt.provider_id);
  if (card && !card.querySelector(".prov-flag.flagged")) card.querySelector(".prov-head").insertAdjacentHTML("beforeend", '<span class="prov-flag flagged">⚑ flagged</span>');
  const fb = $("flagBtn"); if (fb) { fb.textContent = "⚑ flagged"; fb.disabled = true; }
  renderLedger();
}

/* ──────────────────────────── rendering ───────────────────────────── */
function renderProviders(route, prevById) {
  // FLIP capture (#2): record current positions by provider before clearing
  const old = {};
  [...$("providerList").children].forEach((c) => { if (c.dataset.providerId) old[c.dataset.providerId] = c.getBoundingClientRect().top; });
  ui.route = route;
  const list = $("providerList"); list.innerHTML = "";
  route.options.forEach((opt, i) => {
    const dropped = prevById && prevById[opt.provider_id] != null && opt.reputation < prevById[opt.provider_id];
    const tag = dropped ? topTag(ui.repDetail[opt.provider_id] && ui.repDetail[opt.provider_id].by_tag) : null;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "case-item provider" + (i === 0 ? " is-active" : "") + (dropped ? " is-dropped" : "");
    b.dataset.optionId = opt.option_id; b.dataset.providerId = opt.provider_id;
    b.innerHTML = `
      <div class="prov-head">
        <span class="prov-name">${opt.name}</span>
        ${dropped ? `<span class="prov-flag caught">caught${tag ? " · " + tag : ""}</span>` : ""}
        ${ui.flagged.has(opt.provider_id) ? '<span class="prov-flag flagged">⚑ flagged</span>' : ""}
        <span class="prov-rank">#${i + 1}</span>
        <span class="prov-inspect" data-act="inspect" role="button" title="Inspect reputation provenance">ⓘ</span>
      </div>
      <div class="prov-stats"><span><b>${algo(opt.price)}</b></span><span>rep <b>${opt.reputation ?? "—"}</b></span><span>val <b>${Math.round(opt.validation_rate * 100)}%</b></span><span>trust <b>${opt.trust_score}</b> · w ${opt.weight}%</span></div>
      <div class="prov-trust"><i style="width:0%"></i></div>`;
    b.addEventListener("click", (e) => { if (e.target.closest('[data-act="inspect"]')) inspectProvider(opt); else pick(opt.option_id); });
    list.appendChild(b);
    requestAnimationFrame(() => { const f = b.querySelector(".prov-trust > i"); if (f) f.style.width = `${opt.trust_score}%`; });
  });
  (route.excluded || []).forEach((ex) => {
    const d = document.createElement("div");
    d.className = "case-item provider is-excluded";
    d.innerHTML = `<div class="prov-head"><span class="prov-name">${ex.name}</span><span class="prov-flag excluded">excluded</span></div>
      <div class="prov-excluded-note">unrated — ${ex.reason}; held out of routing</div>`;
    list.appendChild(d);
  });
  // FLIP play
  if (!reduceMotion()) [...list.children].forEach((c) => {
    const pid = c.dataset.providerId; if (!pid || old[pid] == null) return;
    const dy = old[pid] - c.getBoundingClientRect().top;
    if (!dy) return;
    c.style.transform = `translateY(${dy}px)`; c.style.transition = "none";
    requestAnimationFrame(() => { c.style.transition = "transform 520ms cubic-bezier(0.34,1.2,0.64,1)"; c.style.transform = ""; });
  });
  $("railMeta").textContent = `${route.options.length} ranked${route.excluded && route.excluded.length ? ` · ${route.excluded.length} held` : ""}`;
  pick(route.options[0].option_id, true);
}

function pick(optionId, silent) {
  ui.picked = ui.route.options.find((o) => o.option_id === optionId);
  [...$("providerList").children].forEach((c) => c.classList.toggle("is-active", c.dataset && c.dataset.optionId === optionId));
  const p = ui.picked;
  const parts = trustParts(p.price, p.reputation ?? 0, p.validation_rate, ui.route.options);
  $("slateEyebrow").innerHTML = `<span class="sb-strong">Selected agent</span> · weighted-lottery pick`;
  $("slateTitle").textContent = p.name;
  $("slateSubtitle").textContent = `${algo(p.price)} · reputation ${p.reputation ?? "unrated"} · trust ${p.trust_score}/100 · weight ${p.weight}%`;

  const canvas = $("slateCanvas"); canvas.dataset.empty = "0"; canvas.classList.remove("is-collapsed");
  $("quoteWrap").innerHTML = `
    <div class="quote-card">
      <div class="qc-eyebrow">x402 quote · ${ui.register}</div>
      <div class="qc-row"><span class="qc-k">Agent</span><span class="qc-v">${p.name}</span></div>
      <div class="qc-row"><span class="qc-k">Address</span><span class="qc-v">${p.provider_id.split(":").pop().slice(0, 12)}…</span></div>
      <div class="qc-row"><span class="qc-k">Quote</span><span class="qc-v accent">${algo(p.price)}</span></div>
      <div class="qc-row"><span class="qc-k">Reputation</span><span class="qc-v">${p.reputation ?? "unrated"}${p.reputation != null ? " / 100" : ""}</span></div>
      <div class="qc-breakdown" title="trust = 0.3·price + 0.4·reputation + 0.3·validation">
        <div class="qcb-label">Trust score · ${p.trust_score}/100</div>
        <div class="qcb-bar">
          <i class="qcb-price" style="width:${parts.price * 100}%"></i><i class="qcb-rep" style="width:${parts.reputation * 100}%"></i><i class="qcb-val" style="width:${parts.validation * 100}%"></i>
        </div>
        <div class="qcb-legend"><span><i class="dot price"></i>price ${Math.round(parts.price * 100)}</span><span><i class="dot rep"></i>reputation ${Math.round(parts.reputation * 100)}</span><span><i class="dot val"></i>validation ${Math.round(parts.validation * 100)}</span></div>
      </div>
    </div>`;

  $("metricBand").hidden = true;
  $("dispoArtifact").hidden = true;
  $("causalLine").hidden = true;
  $("summaryLine").hidden = true;
  $("briefArea").hidden = false;
  $("briefBody").innerHTML = `<span class="brief-opener"><em>${p.name}</em> leads the route at ${algo(p.price)} — ${p.weight}% of the weighted lottery. Approve to settle over x402 on Algorand, then validate the delivery against this quote on-chain.</span>`;
  $("disposition").hidden = false;
  setStep("rank");
  if (!silent) toast(`Picked ${p.name}`);
}

function renderMetricBand(quoted, settled, response) {
  const band = $("metricBand"); band.hidden = false;
  const over = settled != null && quoted != null && settled > quoted + 1e-9;
  const cell = (label, val, cls, cap, capCls) =>
    `<div class="metric-cell"><div class="metric-label">${label}</div><div class="metric-number ${val == null ? "pending" : cls || ""}">${val == null ? "··" : val}</div><div class="metric-caption ${capCls || ""}">${cap}</div></div>`;
  band.innerHTML =
    cell("Quoted", quoted == null ? null : quoted.toFixed(2), "", "ALGO · x402") +
    cell("Settled", settled == null ? null : settled.toFixed(2), over ? "bad" : "good", settled == null ? "settling…" : (over ? `+${(settled - quoted).toFixed(2)} hidden fee` : "matches quote"), over ? "bad" : "") +
    cell("Validation", response == null ? null : String(response), response == null ? "" : (response === 0 ? "bad" : "good"), response == null ? "validating…" : (response === 0 ? "price-vs-quote failed" : "verdict passed"), response === 0 ? "bad" : "");
}

function renderProof(pay) {
  const pop = pay.proof_of_payment; if (!pop) return "";
  return `<div class="x402-badge">◇ x402 · payment-anchored</div>
    <div class="proof"><span>from ${pop.from}</span><span>to ${shortTx(pop.to)}</span><span>${(pop.amount / 1e6).toFixed(2)} ${pop.asset === 0 ? "ALGO" : "ASA:" + pop.asset}</span><span>round r${pop.round}</span><span>nonce ${pop.nonce}</span></div>`;
}

function renderCausal(pay, v, prevRep) {   // #3 causal "because" line
  const el = $("causalLine"); el.hidden = false;
  const over = pay.settled_amount > pay.quoted_amount + 1e-9;
  const tag = topTag(ui.repDetail[ui.picked.provider_id] && ui.repDetail[ui.picked.provider_id].by_tag);
  if (v.response < 100) {
    el.className = "causal-line bad";
    el.innerHTML = `<span class="cl-key">Reputation ${prevRep ?? "—"} → ${v.new_reputation ?? "—"}</span> <span class="cl-because">because</span> ${over ? `settled <b>${pay.settled_amount.toFixed(2)}</b> &gt; quoted <b>${pay.quoted_amount.toFixed(2)}</b> ALGO` : `output fell below threshold`}${tag ? ` — <span class="cl-tag">${tag}</span>` : ""}.`;
  } else {
    el.className = "causal-line good";
    el.innerHTML = `<span class="cl-key">Reputation held</span> <span class="cl-because">because</span> settled matched the quote and output passed validation.`;
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
  const outTxt = v.output_pass === null ? "n/a (output check skipped)" : (v.output_pass ? "passed" : "below threshold");
  $("briefBody").innerHTML = `
    <span class="brief-opener"><em>${pay.read}</em></span>
    On-chain validation compared the settled amount to the quote.
    ${over ? `<div class="gap-flag">⚠ settled ${pay.settled_amount.toFixed(2)} &gt; quoted ${pay.quoted_amount.toFixed(2)} ALGO — hidden fee caught from chain data.</div>` : ` Settlement matched the quote; output ${outTxt}.`}
    ${renderProof(pay)}
    <div class="brief-txids">settle <a class="txid-link" href="${explorer(txid)}" target="_blank" rel="noopener">${shortTx(txid)} ↗</a> · verdict <a class="txid-link" href="${explorer(v.verdict_txid)}" target="_blank" rel="noopener">${shortTx(v.verdict_txid)} ↗</a></div>`;
  $("disposition").hidden = true;
}

function renderSignedPacket(pay, v, picked, prevRep) {
  const over = pay.settled_amount > pay.quoted_amount + 1e-9;
  const down = prevRep != null && v.new_reputation != null && v.new_reputation < prevRep;
  const outTxt = v.output_pass === null ? "n/a" : (v.output_pass ? "pass" : "below threshold");
  const packetHash = hashHex(40);
  const art = $("dispoArtifact"); art.hidden = false;
  art.innerHTML = `
    <div class="da-bar"><span class="da-stamp">${over ? "Contested" : "Settled"}</span><span class="da-title">${picked.name} · validated</span><span class="da-time">${NETWORK}</span></div>
    <div class="da-body">
      <div class="da-section"><div class="da-label">Disposition</div><div class="da-text">Paid <em>${pay.quoted_amount.toFixed(2)}</em> → settled <em>${pay.settled_amount.toFixed(2)}</em> ALGO</div></div>
      <div class="da-section"><div class="da-label">Verdict</div><div class="da-text">${v.price_match ? "price match" : "price-vs-quote FAILED"} · output ${outTxt} · response ${v.response}/100</div></div>
      <div class="da-section"><div class="da-label">Reputation</div><div class="da-text"><span class="rep-line"><span class="rep-from">${prevRep ?? "—"}</span>→<span class="rep-to ${down ? "down" : "up"}">${v.new_reputation ?? "—"}</span></span></div></div>
      <div class="da-section"><div class="da-label">Committed to ledger</div><div class="da-text">${pay.txids.length + 1} anchors · hash-only</div></div>
    </div>
    <div class="da-foot">
      <div class="da-hash"><span class="da-hash-label">SHA-256</span><code class="copyable" data-copy="${packetHash}" title="click to copy">${packetHash}</code></div>
      <div class="da-handoff">${(over || v.response < 100) ? `<button class="dispo-btn da-handoff-btn da-flag" id="flagBtn">⚑ Flag agent</button>` : ""}<button class="dispo-btn da-handoff-btn" id="rerunBtn">↻ Re-run request</button><a class="dispo-btn da-handoff-btn" href="${explorer(v.verdict_txid)}" target="_blank" rel="noopener">View on explorer ›</a></div>
    </div>`;
  $("rerunBtn").addEventListener("click", () => doRoute(true));
  if ($("flagBtn")) $("flagBtn").addEventListener("click", () => flagProvider(picked));
}

function renderRegistry(prevScores) {
  const opts = (ui.route && ui.route.options) || [];
  const excl = (ui.route && ui.route.excluded) || [];
  const list = $("registryList"); list.innerHTML = "";
  [...opts.map((o) => ({ id: o.provider_id, name: o.name })), ...excl.map((e) => ({ id: e.provider_id, name: e.name, excluded: true }))].forEach((r) => {
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
      <div class="rr-prov">${r.excluded ? "no validated history" : `<span class="rr-verified">✓ ${reads} paid reviews</span> · ${corr} corrections${tag ? ` · <span class="rr-tag">${tag}</span>` : ""}`}</div>`;
    list.appendChild(row);
    if (score != null) requestAnimationFrame(() => { const f = row.querySelector(".rr-bar > i"); if (f) f.style.width = `${score}%`; });
  });
}

async function loadRepDetail(route) {
  const ids = [...route.options.map((o) => o.provider_id), ...((route.excluded || []).map((e) => e.provider_id))];
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

function modal(eyebrow, title, html) {   // generic modal (ledger + provider inspect)
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
      <div class="lm-kv"><span>txid</span><a class="txid-link" href="${explorer(a.txid)}" target="_blank" rel="noopener">${a.txid} ↗</a> <span class="copy-ic copyable" data-copy="${a.txid}">⧉</span></div>
    </div>`).join("") : `<p class="panel-placeholder">No anchors yet.</p>`;
  modal("On-chain ledger · hash-only · verifiable by anyone", "Anchored records", html);
}
async function inspectProvider(opt) {   // JTBD#3 click-in: reputation provenance from the router
  const d = ui.repDetail[opt.provider_id] || await api.reputation(opt.provider_id) || {};
  const parts = trustParts(opt.price, opt.reputation ?? 0, opt.validation_rate, ui.route.options);
  const tag = topTag(d.by_tag);
  modal("Reputation provenance · ERC-8004-shaped", opt.name, `
    <p class="lm-mean">Reputation = how this agent's reads survive on-chain validation. Earned from paid reviews, not self-reported.</p>
    <div class="lm-kv"><span>agent</span><code class="copyable" data-copy="${opt.provider_id}">${opt.provider_id}</code></div>
    <div class="lm-kv"><span>score</span><code>${d.score ?? opt.reputation ?? "unrated"}${(d.score ?? opt.reputation) != null ? " / 100" : ""}</code></div>
    <div class="lm-kv"><span>paid reviews</span><code>${d.reads_logged ?? "—"}</code></div>
    <div class="lm-kv"><span>corrections</span><code>${d.corrections_logged ?? "—"}${tag ? ` · ${tag}` : ""}</code></div>
    <div class="lm-kv"><span>validation</span><code>${Math.round(opt.validation_rate * 100)}%</code></div>
    <div class="lm-kv"><span>quote</span><code>${algo(opt.price)}</code></div>
    <div class="lm-sub">trust score · ${opt.trust_score}/100</div>
    <div class="qcb-bar"><i class="qcb-price" style="width:${parts.price * 100}%"></i><i class="qcb-rep" style="width:${parts.reputation * 100}%"></i><i class="qcb-val" style="width:${parts.validation * 100}%"></i></div>
    <div class="qcb-legend"><span><i class="dot price"></i>price ${Math.round(parts.price * 100)}</span><span><i class="dot rep"></i>reputation ${Math.round(parts.reputation * 100)}</span><span><i class="dot val"></i>validation ${Math.round(parts.validation * 100)}</span></div>
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
    const prevById = isRerun && ui.route ? Object.fromEntries(ui.route.options.map((o) => [o.provider_id, o.reputation])) : null;
    const route = await api.route({ task: ($("taskInput").value || "").trim() || REGISTER_TASKS[ui.register], register: ui.register });
    ui.runs += 1;
    $("breadcrumb").textContent = `${ui.register} route`; $("crumb-sep").hidden = false;
    await loadRepDetail(route);
    if (isRerun && prevById) {
      const top = route.options[0];
      const dropped = route.options.find((o) => prevById[o.provider_id] != null && o.reputation < prevById[o.provider_id]);
      $("classification").textContent = dropped
        ? `REROUTED · ${dropped.name} dropped to #${route.options.indexOf(dropped) + 1} · ${top.name} now leads`
        : `RE-RANKED · ${top.name} leads`;
      if (dropped) toast(`Rerouted: ${dropped.name} dropped after validation — ${top.name} now leads.`);
    } else {
      $("classification").textContent = `ROUTE · ${ui.register.toUpperCase()} · ${NETWORK.toUpperCase()}`;
    }
    renderProviders(route, prevById);
    renderRegistry(prevById);
    await renderLedger();
    renderReceipt();
  } catch (e) {
    toast(`Route failed: ${e.message}`, true);
  } finally {
    $("routeBtn").disabled = false;
  }
}

async function doApprove() {
  if (!ui.route || !ui.picked) return;
  const picked = ui.picked, prevRep = picked.reputation;
  $("dispoPrimary").disabled = true; $("dispoDefer").disabled = true;
  $("slateCanvas").setAttribute("aria-busy", "true");
  setStep("pay");
  renderMetricBand(picked.price, null, null);
  $("briefBody").innerHTML = `<span class="brief-opener">Settling <em>${picked.name}</em> over x402 on Algorand…</span>`;
  $("disposition").hidden = true;
  try {
    const pay = await api.pay({ route_id: ui.route.route_id, option_id: picked.option_id });
    renderMetricBand(pay.quoted_amount, pay.settled_amount, null);
    setStep("validate");
    const v = await api.validate({ payment_id: pay.payment_id });
    renderMetricBand(pay.quoted_amount, pay.settled_amount, v.response);
    $("slateCanvas").classList.add("is-collapsed");          // #10 progressive disclosure
    renderCausal(pay, v, prevRep);
    renderBriefVerdict(pay, v);
    renderSignedPacket(pay, v, picked, prevRep);
    renderSummary(pay, v);
    await loadRepDetail(ui.route);
    renderRegistry({ [picked.provider_id]: prevRep });
    await renderLedger();
    setStep("reputation");
    renderReceipt();
    toast(v.response === 0 ? `${picked.name} charged above quote — reputation ${prevRep ?? "—"}→${v.new_reputation ?? "—"}, anchored.` : `${picked.name} validated — reputation held.`, v.response === 0);
  } catch (e) {
    toast(`Payment/validation failed: ${e.message}`, true);
    $("disposition").hidden = false;
  } finally {
    $("dispoPrimary").disabled = false; $("dispoDefer").disabled = false;
    $("slateCanvas").removeAttribute("aria-busy");
  }
}

function doDeny() { $("briefArea").hidden = true; toast("Denied — no settlement."); }

/* scenario chips (#4) */
function runScenario(register, task) {
  const tab = [...document.querySelectorAll(".reg-tab")].find((t) => t.dataset.register === register);
  if (tab) { document.querySelectorAll(".reg-tab").forEach((t) => t.classList.remove("is-active")); tab.classList.add("is-active"); }
  ui.register = register; $("taskInput").value = task; setBanner(); doRoute(false);
}

/* ───────────────────────────── wire up ────────────────────────────── */
function boot() {
  $("routeBtn").addEventListener("click", () => doRoute(false));
  $("dispoPrimary").addEventListener("click", doApprove);
  $("dispoDefer").addEventListener("click", doDeny);
  $("taskInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doRoute(false); } });

  [...document.querySelectorAll(".scenario-chip")].forEach((c) => c.addEventListener("click", () => runScenario(c.dataset.register, c.dataset.task)));

  [...document.querySelectorAll(".reg-tab")].forEach((tab) => tab.addEventListener("click", () => {
    if (tab.classList.contains("is-active")) return;
    document.querySelectorAll(".reg-tab").forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    ui.register = tab.dataset.register; $("taskInput").value = REGISTER_TASKS[ui.register] || ""; setBanner(); doRoute(false);
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
  const mode = !ANY_LIVE ? "mock" : serverUp ? "live :3001" : "offline";
  el.innerHTML = `
    <div class="cc-net cc-${NETWORK}"><span class="cc-dot"></span>ALGORAND · ${NETWORK.toUpperCase()} <span class="cc-mode">${mode}</span></div>
    <div class="cc-apps">
      <div class="cc-app"><span>settlement</span><code>x402 · note anchor</code></div>
      <div class="cc-app"><span>server</span><code ${ANY_LIVE ? `class="copyable" data-copy="${BASE_URL}"` : ""}>${ANY_LIVE ? BASE_URL.replace(/^https?:\/\//, "") : "—"}</code></div>
      <div class="cc-app"><span>explorer</span><code>lora · ${NETWORK}</code></div>
    </div>`;
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
