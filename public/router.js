/*
 * trust-router.js · Liminal x402 Trust Router · UI lane (Shruti)
 * ════════════════════════════════════════════════════════════════════
 * Drives the router flow inside the Liminal desktop-app shell (cut-shell.css).
 * Mock-first: renders the full loop with the backend OFF.
 *   route → rank (left rail) → pick → approve gate (brief) → pay/validate
 *   → signed packet (dispo-artifact) → ledger (audit ribbon) → RE-RUN reroutes.
 *
 * Going live: set API_BASE to the router-server origin (one const). Every call
 * already routes through `api.*`, which fetches the frozen endpoints
 * (TEAM_SWIMLANES_2026-06-06.md) when API_BASE is set, mock otherwise.
 */

/* ───────────────────────────── config ─────────────────────────────── */
const API_BASE = null;                 // null = MOCK. Set to "http://127.0.0.1:8787" for live.
const NETWORK  = "localnet";
const TRUST_WEIGHTS = { price: 0.3, reputation: 0.4, validation: 0.3 };
const EXPLORER = {
  localnet: (tx) => `https://lora.algokit.io/localnet/transaction/${tx}`,
  testnet:  (tx) => `https://lora.algokit.io/testnet/transaction/${tx}`,
  mainnet:  (tx) => `https://lora.algokit.io/mainnet/transaction/${tx}`,
};

/* ──────────────────────── mock backend state ──────────────────────── */
const mock = {
  seq: 0, routes: new Map(), payments: new Map(), ledger: [],
  providers: [
    { id: `algorand:${NETWORK}:HELIOSXDILIGENCE`, name: "Helios Diligence",   register: "Diligence", price: 0.45, reputation: 82, validation_rate: 0.97, dishonest: false },
    { id: `algorand:${NETWORK}:BOREALISANALYTIQ`, name: "Borealis Analytics", register: "Diligence", price: 0.38, reputation: 76, validation_rate: 0.95, dishonest: false },
    { id: `algorand:${NETWORK}:VEGAQUOTESCHEAPZ`, name: "Vega Quotes",        register: "Diligence", price: 0.22, reputation: 71, validation_rate: 0.90, dishonest: true  },
  ],
};
const rand32 = (n = 52) => { const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let s = ""; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
const hashHex = (n = 64) => { const a = "0123456789abcdef"; let s = ""; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
let mockRound = 41000000 + Math.floor(Math.random() * 1000);

function trustScore(p, all) {
  const prices = all.map((x) => x.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const priceScore = max === min ? 1 : (max - p.price) / (max - min);
  return priceScore * TRUST_WEIGHTS.price + (p.reputation / 100) * TRUST_WEIGHTS.reputation + p.validation_rate * TRUST_WEIGHTS.validation;
}

const mockApi = {
  route({ task, register }) {
    const pool = mock.providers.filter((p) => p.register === register && p.reputation > 0);
    const scored = pool.map((p) => ({ p, t: trustScore(p, pool) }));
    const sum = scored.reduce((a, s) => a + s.t, 0) || 1;
    const options = scored.map(({ p, t }) => ({
      option_id: `opt_${p.id.split(":").pop().slice(0, 6)}`,
      provider_id: p.id, name: p.name, price: p.price, reputation: p.reputation,
      validation_rate: p.validation_rate,
      trust_score: Math.round(t * 1000) / 10, weight: Math.round((t / sum) * 1000) / 10,
      _dishonest: p.dishonest,
    })).sort((a, b) => b.trust_score - a.trust_score);
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
    const txids = [rand32()]; if (hiddenFee > 0) txids.push(rand32());
    const payment_id = `pay_${++mock.seq}`;
    mock.payments.set(payment_id, { route_id, option_id, provider_id: opt.provider_id, quoted, settled, dishonest: opt._dishonest, name: opt.name });
    txids.forEach((tx, i) => mock.ledger.unshift({ txid: tx, schema: i === 0 ? "x402.settle" : "x402.settle.fee", ref_id: payment_id, hash: hashHex(), round: ++mockRound, network: NETWORK }));
    return Promise.resolve({ payment_id, route_id, option_id, settle_txid: txids[0], txids, quoted_amount: quoted, settled_amount: settled, read: opt._dishonest ? "Delivered read (charged above quote)." : "Delivered read." });
  },
  validate({ payment_id }) {
    const pay = mock.payments.get(payment_id);
    if (!pay) return Promise.reject(new Error("unknown payment"));
    const price_match = pay.settled <= pay.quoted + 1e-9;
    const output_pass = true;
    const response = price_match ? (output_pass ? 100 : 60) : 0;
    const prov = mock.providers.find((p) => p.id === pay.provider_id);
    const prev = prov.reputation;
    if (response === 0) { prov.reputation = Math.max(0, Math.round(prev * 0.58)); prov.validation_rate = Math.max(0.1, Math.round(prov.validation_rate * 0.5 * 100) / 100); }
    else { prov.reputation = Math.min(100, prev + 1); }
    const verdict_txid = rand32();
    mock.ledger.unshift({ txid: verdict_txid, schema: "erc8004.feedback", ref_id: payment_id, hash: hashHex(), round: ++mockRound, network: NETWORK });
    return Promise.resolve({ validation_id: `val_${++mock.seq}`, price_match, output_pass, response, new_reputation: prov.reputation, prev_reputation: prev, provider_id: pay.provider_id, verdict_txid });
  },
  reputation(provider) {
    const p = mock.providers.find((x) => x.id === provider);
    return Promise.resolve(p ? { provider_id: p.id, score: p.reputation, reads_logged: 1, corrections_logged: p.dishonest ? 1 : 0, by_tag: {}, uri: `liminal://corrections/${p.id}`, hash: hashHex() } : null);
  },
  ledgerAll() { return Promise.resolve({ anchors: mock.ledger.slice() }); },
};

/* ───────────────────────── api wrapper (mock ↔ live) ──────────────── */
const post = (path, body) => fetch(API_BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const get = (path) => fetch(API_BASE + path).then((r) => r.json());
const api = {
  route: (b) => API_BASE ? post("/api/route", b) : mockApi.route(b),
  pay: (b) => API_BASE ? post("/api/pay", b) : mockApi.pay(b),
  validate: (b) => API_BASE ? post("/api/validate", b) : mockApi.validate(b),
  reputation: (p) => API_BASE ? get(`/api/reputation?provider=${encodeURIComponent(p)}`) : mockApi.reputation(p),
  ledger: () => API_BASE ? get("/api/ledger") : mockApi.ledgerAll(),
};

/* ──────────────────────────── helpers ─────────────────────────────── */
const $ = (id) => document.getElementById(id);
const algo = (n) => `${Number(n).toFixed(2)} ALGO`;
const shortTx = (tx) => `${tx.slice(0, 6)}…${tx.slice(-4)}`;
const explorer = (tx) => (EXPLORER[NETWORK] || EXPLORER.localnet)(tx);
let toastTimer = null;
function toast(msg) {
  const t = $("toast"); const m = $("toast-msg"); if (!t || !m) return;
  m.textContent = msg; t.classList.add("is-shown");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("is-shown"), 3200);
}

/* ──────────────────────────── ui state ────────────────────────────── */
const ui = { route: null, picked: null, register: "Diligence", runs: 0 };

/* ──────────────────────────── rendering ───────────────────────────── */
function renderProviders(route, prevById) {
  ui.route = route;
  const list = $("providerList"); list.innerHTML = "";
  route.options.forEach((opt, i) => {
    const dropped = prevById && prevById[opt.provider_id] != null && opt.reputation < prevById[opt.provider_id];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "case-item provider" + (i === 0 ? " is-active" : "") + (dropped ? " is-dropped" : "");
    b.dataset.optionId = opt.option_id;
    b.innerHTML = `
      <div class="prov-head">
        <span class="prov-name">${opt.name}</span>
        ${dropped ? '<span class="prov-flag caught">caught</span>' : ""}
        <span class="prov-rank">#${i + 1}</span>
      </div>
      <div class="prov-stats"><span><b>${algo(opt.price)}</b></span><span>rep <b>${opt.reputation}</b></span><span>trust <b>${opt.trust_score}</b></span><span>w <b>${opt.weight}%</b></span></div>
      <div class="prov-trust"><i style="width:0%"></i></div>`;
    b.addEventListener("click", () => pick(opt.option_id));
    list.appendChild(b);
    requestAnimationFrame(() => { const f = b.querySelector(".prov-trust > i"); if (f) f.style.width = `${opt.trust_score}%`; });
  });
  $("railMeta").textContent = `${route.options.length} ranked`;
  pick(route.options[0].option_id, true);
}

function pick(optionId, silent) {
  ui.picked = ui.route.options.find((o) => o.option_id === optionId);
  [...$("providerList").children].forEach((c) => c.classList.toggle("is-active", c.dataset.optionId === optionId));
  const p = ui.picked;
  $("slateEyebrow").innerHTML = `<span class="sb-strong">Selected provider</span> · weighted-lottery pick`;
  $("slateTitle").textContent = p.name;
  $("slateSubtitle").textContent = `${algo(p.price)} · reputation ${p.reputation} · trust ${p.trust_score}/100 · weight ${p.weight}%`;

  // quote card in canvas
  const canvas = $("slateCanvas"); canvas.dataset.empty = "0";
  $("quoteWrap").innerHTML = `
    <div class="quote-card">
      <div class="qc-eyebrow">x402 quote · ${ui.register}</div>
      <div class="qc-row"><span class="qc-k">Provider</span><span class="qc-v">${p.name}</span></div>
      <div class="qc-row"><span class="qc-k">Address</span><span class="qc-v">${p.provider_id.split(":").pop().slice(0, 10)}…</span></div>
      <div class="qc-row"><span class="qc-k">Quote</span><span class="qc-v accent">${algo(p.price)}</span></div>
      <div class="qc-row"><span class="qc-k">Reputation</span><span class="qc-v">${p.reputation} / 100</span></div>
      <div class="qc-row"><span class="qc-k">Validation rate</span><span class="qc-v">${Math.round(p.validation_rate * 100)}%</span></div>
    </div>`;

  // pre-pay brief + disposition gate
  $("metricBand").hidden = true;
  $("dispoArtifact").hidden = true;
  const brief = $("briefArea"); brief.hidden = false;
  $("briefBody").innerHTML = `<span class="brief-opener"><em>${p.name}</em> leads the route at ${algo(p.price)} — ${p.weight}% of the weighted lottery. Approve to settle over x402 on Algorand, then validate the delivery against this quote on-chain.</span>`;
  $("disposition").hidden = false;
  if (!silent) toast(`Picked ${p.name}`);
}

function renderMetricBand(pay, v) {
  const over = pay.settled_amount > pay.quoted_amount + 1e-9;
  const band = $("metricBand"); band.hidden = false;
  band.innerHTML = `
    <div class="metric-cell"><div class="metric-label">Quoted</div><div class="metric-number">${pay.quoted_amount.toFixed(2)}</div><div class="metric-caption">ALGO · x402</div></div>
    <div class="metric-cell"><div class="metric-label">Settled</div><div class="metric-number ${over ? "bad" : "good"}">${pay.settled_amount.toFixed(2)}</div><div class="metric-caption ${over ? "bad" : ""}">${over ? `+${(pay.settled_amount - pay.quoted_amount).toFixed(2)} hidden fee` : "matches quote"}</div></div>
    <div class="metric-cell"><div class="metric-label">Validation</div><div class="metric-number ${v.response === 0 ? "bad" : "good"}">${v.response}</div><div class="metric-caption ${v.response === 0 ? "bad" : ""}">${v.response === 0 ? "price-vs-quote failed" : "verdict passed"}</div></div>`;
}

function renderBriefVerdict(pay, v) {
  const over = pay.settled_amount > pay.quoted_amount + 1e-9;
  $("briefBody").innerHTML = `
    <span class="brief-opener"><em>${pay.read}</em></span>
    On-chain validation compared the settled amount to the quote.
    ${over ? `<div class="gap-flag">⚠ settled ${pay.settled_amount.toFixed(2)} &gt; quoted ${pay.quoted_amount.toFixed(2)} ALGO — hidden fee caught from chain data.</div>` : ` Settlement matched the quote.`}
    <div style="margin-top:10px;font-family:var(--mono);font-size:var(--fs-mono-xs);color:var(--text-faint)">
      settle <a class="txid-link" href="${explorer(pay.settle_txid)}" target="_blank" rel="noopener">${shortTx(pay.settle_txid)} ↗</a>
      · verdict <a class="txid-link" href="${explorer(v.verdict_txid)}" target="_blank" rel="noopener">${shortTx(v.verdict_txid)} ↗</a>
    </div>`;
  $("disposition").hidden = true;
}

function renderSignedPacket(pay, v) {
  const over = pay.settled_amount > pay.quoted_amount + 1e-9;
  const down = v.new_reputation < v.prev_reputation;
  const art = $("dispoArtifact"); art.hidden = false;
  art.innerHTML = `
    <div class="da-bar">
      <span class="da-stamp">${over ? "Contested" : "Settled"}</span>
      <span class="da-title">${pay.name} · validated</span>
      <span class="da-time">${NETWORK}</span>
    </div>
    <div class="da-body">
      <div class="da-section"><div class="da-label">Disposition</div><div class="da-text">Paid <em>${pay.quoted_amount.toFixed(2)}</em> → settled <em>${pay.settled_amount.toFixed(2)}</em> ALGO</div></div>
      <div class="da-section"><div class="da-label">Verdict</div><div class="da-text">${v.price_match ? "price match" : "price-vs-quote FAILED"} · response ${v.response}/100</div></div>
      <div class="da-section"><div class="da-label">Reputation</div><div class="da-text"><span class="rep-line"><span class="rep-from">${v.prev_reputation}</span>→<span class="rep-to ${down ? "down" : "up"}">${v.new_reputation}</span></span></div></div>
      <div class="da-section"><div class="da-label">Committed to ledger</div><div class="da-text">${pay.txids.length + 1} anchors · hash-only</div></div>
    </div>
    <div class="da-foot">
      <div class="da-hash"><span class="da-hash-label">SHA-256</span><code>${hashHex(40)}</code></div>
      <div class="da-handoff">
        <button class="dispo-btn da-handoff-btn" id="rerunBtn">↻ Re-run request</button>
        <a class="dispo-btn da-handoff-btn" href="${explorer(v.verdict_txid)}" target="_blank" rel="noopener">View on explorer ›</a>
      </div>
    </div>`;
  $("rerunBtn").addEventListener("click", () => doRoute(true));
}

function renderRegistry(prevById) {
  const pool = mock.providers.filter((p) => p.register === ui.register);
  const list = $("registryList"); list.innerHTML = "";
  pool.slice().sort((a, b) => b.reputation - a.reputation).forEach((p) => {
    const caught = prevById && prevById[p.id] != null && p.reputation < prevById[p.id];
    const delta = prevById && prevById[p.id] != null ? p.reputation - prevById[p.id] : 0;
    const row = document.createElement("div");
    row.className = "reg-row" + (caught ? " is-caught" : "");
    row.innerHTML = `
      <div class="rr-head">
        <span class="rr-name">${p.name}</span>
        <span><span class="rr-score ${caught ? "down" : ""}">${p.reputation}</span>${delta < 0 ? `<span class="rr-delta down">${delta}</span>` : ""}</span>
      </div>
      <div class="rr-bar"><i style="width:0%"></i></div>`;
    list.appendChild(row);
    requestAnimationFrame(() => { const f = row.querySelector(".rr-bar > i"); if (f) f.style.width = `${p.reputation}%`; });
  });
}

async function renderLedger() {
  const { anchors } = await api.ledger();
  $("ledgerCount").textContent = anchors.length;
  const rows = $("auditRows");
  rows.innerHTML = anchors.slice(0, 6).map((a) => `
    <span class="ar-row"><span class="ar-time">r${a.round}</span><span class="ar-event ${a.schema.includes("fee") ? "refused" : ""}">${a.schema} ${shortTx(a.txid)}</span></span>`).join("");
}

function renderReceipt() {
  const r = $("frameReceipt");
  r.innerHTML = `
    <span class="fr-glyph">◇</span>
    <span class="fr-strong">route · ${ui.route ? ui.route.route_id : "—"}</span>
    <span class="fr-sep">·</span><span>${ui.route ? ui.route.options.length : 0} providers</span>
    <span class="fr-sep">·</span><span>${NETWORK} · ${API_BASE ? "live" : "mock"}</span>
    <span class="fr-right">⌘? shortcuts · ⌘. tray</span>`;
}

/* ─────────────────────────── flow control ─────────────────────────── */
async function doRoute(isRerun) {
  $("routeBtn").disabled = true;
  const prevById = isRerun && ui.route ? Object.fromEntries(ui.route.options.map((o) => [o.provider_id, o.reputation])) : null;
  const route = await api.route({ task: ($("taskInput").value || "").trim() || "Diligence read", register: ui.register });
  ui.runs += 1;
  $("breadcrumb").textContent = `${ui.register} route`;
  $("crumb-sep").hidden = false;

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
  $("routeBtn").disabled = false;
}

async function doApprove() {
  if (!ui.route || !ui.picked) return;
  $("dispoPrimary").disabled = true; $("dispoDefer").disabled = true;
  const pay = await api.pay({ route_id: ui.route.route_id, option_id: ui.picked.option_id });
  const v = await api.validate({ payment_id: pay.payment_id });
  renderMetricBand(pay, v);
  renderBriefVerdict(pay, v);
  renderSignedPacket(pay, v);
  renderRegistry({ [v.provider_id]: v.prev_reputation });
  await renderLedger();
  renderReceipt();
  toast(v.response === 0 ? `${pay.name} charged above quote — reputation ${v.prev_reputation}→${v.new_reputation}, anchored.` : `${pay.name} validated — reputation held.`);
  $("dispoPrimary").disabled = false; $("dispoDefer").disabled = false;
}

function doDeny() { $("briefArea").hidden = true; toast("Denied — no settlement."); }

/* ───────────────────────────── wire up ────────────────────────────── */
function boot() {
  $("routeBtn").addEventListener("click", () => doRoute(false));
  $("dispoPrimary").addEventListener("click", doApprove);
  $("dispoDefer").addEventListener("click", doDeny);
  $("taskInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doRoute(false); } });

  [...document.querySelectorAll(".reg-tab")].forEach((tab) => tab.addEventListener("click", () => {
    [...document.querySelectorAll(".reg-tab")].forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    ui.register = tab.dataset.register;
    $("netBanner").textContent = `ALGORAND · ${NETWORK.toUpperCase()} · ${API_BASE ? "LIVE" : "MOCK"}`;
  }));

  // tray toggle · cut-shell opens via .stage.tray-open
  const pill = $("tray-pill"), stage = document.querySelector(".stage");
  if (pill && stage) pill.addEventListener("click", () => stage.classList.toggle("tray-open"));

  $("netBanner").textContent = `ALGORAND · ${NETWORK.toUpperCase()} · ${API_BASE ? "LIVE" : "MOCK"}`;
  renderReceipt();
  requestAnimationFrame(() => document.body.classList.add("ready"));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
