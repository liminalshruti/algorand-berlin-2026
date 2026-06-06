/*
 * router.js · Liminal x402 Trust Router · UI lane (Shruti)
 * ════════════════════════════════════════════════════════════════════
 * Mock-first. Renders the full loop with the backend OFF:
 *   request → rank → pay → validate → RE-RUN that reroutes off the cheater.
 *
 * Going live: set API_BASE to the router-server origin (one const). Every
 * call already goes through `api.*`, which fetches the frozen endpoints
 * (TEAM_SWIMLANES_2026-06-06.md) when API_BASE is set, and falls back to
 * the in-file mock otherwise.
 *
 * Frozen API (the contract the UI codes to):
 *   POST /api/route    { task, register } → { route_id, options:[…] }
 *   POST /api/pay      { route_id, option_id } → { payment_id, settle_txid|txids, quoted_amount, settled_amount, read }
 *   POST /api/validate { payment_id } → { validation_id, price_match, output_pass, response, new_reputation, verdict_txid }
 *   GET  /api/reputation?provider=… → { provider_id, score, … }
 *   GET  /api/ledger   → { anchors:[{txid,schema,ref_id,hash,round,network}] }
 */

/* ───────────────────────────── config ─────────────────────────────── */
const API_BASE = null;                 // null = MOCK. Set to "http://127.0.0.1:8787" for live.
const NETWORK  = "localnet";           // localnet | testnet | mainnet
const TRUST_WEIGHTS = { price: 0.3, reputation: 0.4, validation: 0.3 };
const EXPLORER = {
  localnet: (tx) => `https://lora.algokit.io/localnet/transaction/${tx}`,
  testnet:  (tx) => `https://lora.algokit.io/testnet/transaction/${tx}`,
  mainnet:  (tx) => `https://lora.algokit.io/mainnet/transaction/${tx}`,
};

/* ──────────────────────── mock backend state ──────────────────────── */
/* Per-provider reputation persists across runs so the re-run reroutes. */
const mock = {
  seq: 0,
  routes: new Map(),
  payments: new Map(),
  ledger: [],
  providers: [
    { id: `algorand:${NETWORK}:HELIOSXDILIGENCE`, name: "Helios Diligence",   register: "Diligence", price: 0.45, reputation: 82, validation_rate: 0.97, quality: 0.92, dishonest: false },
    { id: `algorand:${NETWORK}:BOREALISANALYTIQ`, name: "Borealis Analytics", register: "Diligence", price: 0.38, reputation: 76, validation_rate: 0.95, quality: 0.86, dishonest: false },
    { id: `algorand:${NETWORK}:VEGAQUOTESCHEAPZ`, name: "Vega Quotes",        register: "Diligence", price: 0.22, reputation: 71, validation_rate: 0.90, quality: 0.58, dishonest: true  },
  ],
};

const rand32 = (n = 52) => {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let s = "";
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
};
const hashHex = (n = 64) => {
  const a = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
};
let mockRound = 41000000 + Math.floor(Math.random() * 1000);

/* pure trust score — same inputs, same output (Reza's lane, mirrored for mock) */
function trustScore(p, all) {
  const prices = all.map((x) => x.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const priceScore = max === min ? 1 : (max - p.price) / (max - min); // cheaper = higher
  const repScore = p.reputation / 100;
  const valScore = p.validation_rate;
  return priceScore * TRUST_WEIGHTS.price + repScore * TRUST_WEIGHTS.reputation + valScore * TRUST_WEIGHTS.validation;
}

const mockApi = {
  route({ task, register }) {
    const pool = mock.providers.filter((p) => p.register === register && p.reputation > 0); // zero-rep excluded
    const scored = pool.map((p) => ({ p, t: trustScore(p, pool) }));
    const sum = scored.reduce((a, s) => a + s.t, 0) || 1;
    const options = scored
      .map(({ p, t }) => ({
        option_id: `opt_${p.id.split(":").pop().slice(0, 6)}`,
        provider_id: p.id,
        name: p.name,
        price: p.price,
        reputation: p.reputation,
        validation_rate: p.validation_rate,
        trust_score: Math.round(t * 1000) / 10,           // 0..100
        weight: Math.round((t / sum) * 1000) / 10,        // % share
        _dishonest: p.dishonest,                          // mock-internal
      }))
      .sort((a, b) => b.trust_score - a.trust_score);
    const route_id = `rt_${++mock.seq}`;
    mock.routes.set(route_id, { task, register, options });
    return Promise.resolve({ route_id, task, register, options });
  },

  pay({ route_id, option_id }) {
    const route = mock.routes.get(route_id);
    const opt = route && route.options.find((o) => o.option_id === option_id);
    if (!opt) return Promise.reject(new Error("unknown route/option"));
    const quoted = opt.price;
    const hiddenFee = opt._dishonest ? Math.round(quoted * 0.82 * 100) / 100 : 0;
    const settled = Math.round((quoted + hiddenFee) * 100) / 100;
    const txids = [rand32()];
    if (hiddenFee > 0) txids.push(rand32());               // dishonest = second settlement
    const payment_id = `pay_${++mock.seq}`;
    mock.payments.set(payment_id, { route_id, option_id, provider_id: opt.provider_id, quoted, settled, hiddenFee, dishonest: opt._dishonest });
    txids.forEach((tx, i) =>
      mock.ledger.unshift({ txid: tx, schema: i === 0 ? "x402.settle" : "x402.settle.fee", ref_id: payment_id, hash: hashHex(), round: ++mockRound, network: NETWORK })
    );
    return Promise.resolve({
      payment_id, route_id, option_id,
      settle_txid: txids[0], txids,
      quoted_amount: quoted, settled_amount: settled,
      read: opt._dishonest ? "Delivered read (charged above quote)." : "Delivered read.",
    });
  },

  validate({ payment_id }) {
    const pay = mock.payments.get(payment_id);
    if (!pay) return Promise.reject(new Error("unknown payment"));
    const price_match = pay.settled <= pay.quoted + 1e-9;
    const output_pass = true;                              // objective price check is the catch; output is stretch
    const response = price_match ? (output_pass ? 100 : 60) : 0;
    const prov = mock.providers.find((p) => p.id === pay.provider_id);
    const prev = prov.reputation;
    if (response === 0) {                                  // caught → reputation strictly decreases
      prov.reputation = Math.max(0, Math.round(prev * 0.58));
      prov.validation_rate = Math.max(0.1, Math.round(prov.validation_rate * 0.5 * 100) / 100);
    } else {
      prov.reputation = Math.min(100, prev + 1);
    }
    const verdict_txid = rand32();
    mock.ledger.unshift({ txid: verdict_txid, schema: "erc8004.feedback", ref_id: payment_id, hash: hashHex(), round: ++mockRound, network: NETWORK });
    return Promise.resolve({
      validation_id: `val_${++mock.seq}`,
      price_match, output_pass, response,
      new_reputation: prov.reputation, prev_reputation: prev,
      provider_id: pay.provider_id, verdict_txid,
    });
  },

  reputation(provider) {
    const p = mock.providers.find((x) => x.id === provider);
    return Promise.resolve(p ? { provider_id: p.id, score: p.reputation, reads_logged: 1, corrections_logged: p.dishonest ? 1 : 0, by_tag: {}, uri: `liminal://corrections/${p.id}`, hash: hashHex() } : null);
  },

  ledgerAll() { return Promise.resolve({ anchors: mock.ledger.slice() }); },
};

/* ───────────────────────── api wrapper (mock ↔ live) ──────────────── */
const api = {
  route: (body) => API_BASE ? post("/api/route", body) : mockApi.route(body),
  pay: (body) => API_BASE ? post("/api/pay", body) : mockApi.pay(body),
  validate: (body) => API_BASE ? post("/api/validate", body) : mockApi.validate(body),
  reputation: (provider) => API_BASE ? get(`/api/reputation?provider=${encodeURIComponent(provider)}`) : mockApi.reputation(provider),
  ledger: () => API_BASE ? get("/api/ledger") : mockApi.ledgerAll(),
};
const post = (path, body) => fetch(API_BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const get = (path) => fetch(API_BASE + path).then((r) => r.json());

/* ──────────────────────────── dom refs ────────────────────────────── */
const $ = (id) => document.getElementById(id);
const el = {
  routeBtn: $("routeBtn"), rerunBtn: $("rerunBtn"),
  task: $("taskInput"), register: $("registerSelect"),
  providerList: $("providerList"), rankMeta: $("rankMeta"), rankEmpty: $("rankEmpty"),
  rerouteBanner: $("rerouteBanner"),
  gate: $("approveGate"), gateProvider: $("gateProvider"), approveBtn: $("approveBtn"), denyBtn: $("denyBtn"),
  payPanel: $("payPanel"), payBody: $("payBody"), payStatus: $("payStatus"),
  valPanel: $("validatePanel"), valBody: $("validateBody"), valStatus: $("validateStatus"),
  ledgerPanel: $("ledgerPanel"), ledgerBody: $("ledgerBody"), ledgerStatus: $("ledgerStatus"),
  netMode: $("netMode"), netLabel: $("netLabel"),
};

/* ──────────────────────────── ui state ────────────────────────────── */
const ui = { route: null, picked: null, runs: 0 };

/* ───────────────────────────── helpers ────────────────────────────── */
const algo = (n) => `${Number(n).toFixed(2)} ALGO`;
const shortTx = (tx) => `${tx.slice(0, 6)}…${tx.slice(-4)}`;
const explorer = (tx) => (EXPLORER[NETWORK] || EXPLORER.localnet)(tx);
function setPanel(panel, statusEl, state, statusText) {
  panel.dataset.state = state;
  if (statusText != null) statusEl.textContent = statusText;
}

/* ──────────────────────────── rendering ───────────────────────────── */
function renderProviders(route, prevById) {
  ui.route = route;
  el.providerList.innerHTML = "";
  route.options.forEach((opt, i) => {
    const dropped = prevById && prevById[opt.provider_id] != null && opt.reputation < prevById[opt.provider_id];
    const node = document.createElement("button");
    node.className = "provider fade-in" + (i === 0 ? " is-picked" : "") + (dropped ? " is-dropped" : "");
    node.type = "button";
    node.dataset.optionId = opt.option_id;
    node.innerHTML = `
      <span class="prov-rank">#${i + 1}</span>
      <div class="prov-top">
        <span class="prov-name">${opt.name}</span>
        ${i === 0 ? '<span class="prov-flag pick">picked</span>' : ""}
        ${dropped ? '<span class="prov-flag caught">caught</span>' : ""}
      </div>
      <div class="prov-metrics">
        <div class="metric"><span class="metric-label">Price</span><span class="metric-value">${algo(opt.price)}</span></div>
        <div class="metric"><span class="metric-label">Reputation</span><span class="metric-value">${opt.reputation}</span></div>
        <div class="metric"><span class="metric-label">Validation</span><span class="metric-value">${Math.round(opt.validation_rate * 100)}%</span></div>
        <div class="metric"><span class="metric-label">Weight</span><span class="metric-value accent">${opt.weight}%</span></div>
      </div>
      <div class="metric" style="margin-top:var(--space-3)">
        <span class="metric-label">Trust score · ${opt.trust_score}/100</span>
        <div class="trust-track"><div class="trust-fill" style="width:0%"></div></div>
      </div>`;
    node.addEventListener("click", () => pick(opt.option_id));
    el.providerList.appendChild(node);
    requestAnimationFrame(() => { node.querySelector(".trust-fill").style.width = `${opt.trust_score}%`; });
  });
  el.rankMeta.textContent = `${route.options.length} providers · ranked`;
  pick(route.options[0].option_id, true);
}

function pick(optionId, silent) {
  ui.picked = ui.route.options.find((o) => o.option_id === optionId);
  [...el.providerList.children].forEach((c) => c.classList.toggle("is-picked", c.dataset.optionId === optionId));
  // keep the "picked" flag chip only on the chosen card
  [...el.providerList.querySelectorAll(".prov-flag.pick")].forEach((f) => f.remove());
  const card = [...el.providerList.children].find((c) => c.dataset.optionId === optionId);
  if (card && !card.querySelector(".prov-flag.pick")) {
    const chip = document.createElement("span");
    chip.className = "prov-flag pick";
    chip.textContent = "picked";
    card.querySelector(".prov-top").insertBefore(chip, card.querySelector(".prov-top").children[1] || null);
  }
  el.gateProvider.textContent = `${ui.picked.name} · ${algo(ui.picked.price)}`;
  el.gate.hidden = false;
  if (!silent) el.gate.classList.add("fade-in");
}

function renderPay(pay) {
  const over = pay.settled_amount > pay.quoted_amount + 1e-9;
  setPanel(el.payPanel, el.payStatus, over ? "alert" : "done", over ? "contested" : "settled");
  el.payBody.innerHTML = `
    <div class="amounts">
      <div class="amount-box quoted"><span class="amt-label">Quoted</span><span class="amt-num">${pay.quoted_amount.toFixed(2)}</span></div>
      <span class="amount-arrow">→</span>
      <div class="amount-box settled ${over ? "over" : ""}"><span class="amt-label">Settled</span><span class="amt-num">${pay.settled_amount.toFixed(2)}</span></div>
    </div>
    ${over ? `<div class="gap-flag hidden-row">⚠ Hidden fee detected · +${(pay.settled_amount - pay.quoted_amount).toFixed(2)} ALGO above quote</div>` : ""}
    <div class="kv" style="margin-top:var(--space-3)">
      <div class="kv-row"><span class="kv-key">Payment</span><span class="kv-val">${pay.payment_id}</span></div>
      ${pay.txids.map((tx, i) => `<div class="kv-row"><span class="kv-key">${i === 0 ? "Settle txid" : "Fee txid"}</span><a class="txid" href="${explorer(tx)}" target="_blank" rel="noopener">${shortTx(tx)} ↗</a></div>`).join("")}
    </div>`;
  el.payBody.classList.add("fade-in");
}

function renderValidate(v, pay) {
  const fail = v.response === 0;
  setPanel(el.valPanel, el.valStatus, fail ? "alert" : "done", fail ? "rejected" : "passed");
  const up = v.new_reputation >= v.prev_reputation;
  el.valBody.innerHTML = `
    <span class="verdict-badge ${fail ? "fail" : "pass"}">${fail ? "✕ price-vs-quote FAILED" : "✓ verdict PASSED"}</span>
    <div class="kv">
      <div class="kv-row"><span class="kv-key">Price match</span><span class="kv-val ${v.price_match ? "good" : "bad"}">${v.price_match}</span></div>
      <div class="kv-row"><span class="kv-key">Output pass</span><span class="kv-val ${v.output_pass ? "good" : "bad"}">${v.output_pass}</span></div>
      <div class="kv-row"><span class="kv-key">Response</span><span class="kv-val ${fail ? "bad" : "good"}">${v.response} / 100</span></div>
      <div class="kv-row"><span class="kv-key">Verdict txid</span><a class="txid" href="${explorer(v.verdict_txid)}" target="_blank" rel="noopener">${shortTx(v.verdict_txid)} ↗</a></div>
    </div>
    <div class="rep-delta">
      <span class="rep-score from">${v.prev_reputation}</span>
      <span class="rep-arrow">→</span>
      <span class="rep-score to ${up ? "up" : ""}">${v.new_reputation}</span>
      <span class="rep-caption">${fail ? "Reputation dropped, anchored on-chain. The next route will avoid this provider." : "Reputation held — read survived validation."}</span>
    </div>`;
  el.valBody.classList.add("fade-in");
}

async function renderLedger() {
  const { anchors } = await api.ledger();
  setPanel(el.ledgerPanel, el.ledgerStatus, anchors.length ? "active" : "idle", `${anchors.length} anchored`);
  el.ledgerBody.innerHTML = anchors.length
    ? `<div class="ledger-list">${anchors.slice(0, 7).map((a) => `
        <div class="ledger-row">
          <span class="ledger-schema">${a.schema}</span>
          <a class="ledger-hash txid" href="${explorer(a.txid)}" target="_blank" rel="noopener" title="${a.txid}">${shortTx(a.txid)} · ${a.hash.slice(0, 10)}…</a>
          <span class="ledger-round">r${a.round}</span>
        </div>`).join("")}</div>`
    : `<p class="panel-placeholder">No anchors yet.</p>`;
}

/* ─────────────────────────── flow control ─────────────────────────── */
async function doRoute(isRerun) {
  el.routeBtn.disabled = true;
  const prevById = isRerun && ui.route ? Object.fromEntries(ui.route.options.map((o) => [o.provider_id, o.reputation])) : null;
  const route = await api.route({ task: el.task.value.trim() || "Diligence read", register: el.register.value });
  ui.runs += 1;

  if (isRerun && prevById) {
    const top = route.options[0];
    const dropped = route.options.find((o) => prevById[o.provider_id] != null && o.reputation < prevById[o.provider_id]);
    el.rerouteBanner.hidden = false;
    el.rerouteBanner.innerHTML = dropped
      ? `Rerouted: <span class="drop">${dropped.name}</span> fell to #${route.options.indexOf(dropped) + 1} after validation. <strong>${top.name}</strong> now leads — the router self-corrected away from the cheater.`
      : `Re-ranked. <strong>${top.name}</strong> leads.`;
    el.rerouteBanner.classList.add("fade-in");
  } else {
    el.rerouteBanner.hidden = true;
  }

  // reset downstream panels
  setPanel(el.payPanel, el.payStatus, "idle", "idle");
  el.payBody.innerHTML = `<p class="panel-placeholder">Approve a provider to settle payment over x402 on Algorand.</p>`;
  setPanel(el.valPanel, el.valStatus, "idle", "idle");
  el.valBody.innerHTML = `<p class="panel-placeholder">Validation compares settled amount to the quote — on-chain.</p>`;
  el.rerunBtn.disabled = true;

  renderProviders(route, prevById);
  await renderLedger();
  el.routeBtn.disabled = false;
}

async function doApprove() {
  if (!ui.route || !ui.picked) return;
  el.approveBtn.disabled = true; el.denyBtn.disabled = true;
  setPanel(el.payPanel, el.payStatus, "active", "settling…");
  const pay = await api.pay({ route_id: ui.route.route_id, option_id: ui.picked.option_id });
  renderPay(pay);
  await renderLedger();

  setPanel(el.valPanel, el.valStatus, "active", "validating…");
  const v = await api.validate({ payment_id: pay.payment_id });
  renderValidate(v, pay);
  await renderLedger();

  el.rerunBtn.disabled = false;
  el.approveBtn.disabled = false; el.denyBtn.disabled = false;
  el.gate.hidden = true;
}

function doDeny() {
  el.gate.hidden = true;
}

/* ───────────────────────────── wire up ────────────────────────────── */
el.routeBtn.addEventListener("click", () => doRoute(false));
el.rerunBtn.addEventListener("click", () => doRoute(true));
el.approveBtn.addEventListener("click", doApprove);
el.denyBtn.addEventListener("click", doDeny);
el.task.addEventListener("keydown", (e) => { if (e.key === "Enter") doRoute(false); });

/* network indicator reflects mock vs live */
el.netMode.textContent = API_BASE ? "LIVE" : "MOCK";
el.netMode.dataset.live = API_BASE ? "true" : "false";
el.netLabel.textContent = `ALGORAND · ${NETWORK.toUpperCase()}`;
