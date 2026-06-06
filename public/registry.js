/*
 * registry.js · ARC-8004 Registry & Admin Console controller.
 * Drives arc8004.js: agents list, agent drill-in (identity + metadata + the
 * transactions behind a reputation score), admin act-as caller switching,
 * full ABI method explorer, ARC-28 transaction log. Everything clicks in.
 */
const $ = (id) => document.getElementById(id);
const A = window.ARC8004;
const short = (s) => (s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "—");
const explorer = (tx) => `https://lora.algokit.io/${A.NET}/transaction/${tx}`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let sel = null;            // selected agentId
let callerRole = "admin";
let evtFilter = "all";
let toastTimer = null;
function toast(msg, bad) { const t = $("toast"), m = $("toast-msg"); m.textContent = msg; t.classList.toggle("is-bad", !!bad); t.classList.add("is-shown"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("is-shown"), 3400); }
function guard(fn) { try { return fn(); } catch (e) { toast(e.message, true); return null; } }

/* ── score helpers ─────────────────────────────────────────────────── */
function repOf(agentId) {
  const clients = A.rep.getClients(agentId).clients;
  const summary = clients.length ? A.rep.getSummary(agentId, clients) : { count: 0, summaryValue: 0, summaryValueDecimals: 0 };
  return { clients, summary };
}

/* ── left rail · agents (registry, by reputation) ──────────────────── */
function renderAgents() {
  const ids = [...A.state.agents.keys()];
  $("agentCount").textContent = ids.length;
  $("agentsMeta").textContent = `${ids.length} registered`;
  const rows = ids.map((id) => { const a = A.state.agents.get(id); const { summary, clients } = repOf(id); return { id, a, score: summary.count ? summary.summaryValue : null, count: summary.count, clients: clients.length }; })
    .sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
  $("agentsList").innerHTML = rows.map((r) => `
    <button class="case-item agent-row ${sel === r.id ? "is-active" : ""}" data-id="${r.id}">
      <div class="ar-top"><span class="ar-name">${esc(r.a.metadata.get("name") || `agent #${r.id}`)}</span><span class="ar-id">#${r.id}</span></div>
      <div class="ar-sub">owner ${short(r.a.owner)} · ${r.count} feedback</div>
      <div class="ar-score">${r.score == null ? '<span class="unrated">unrated</span>' : `<b>${r.score}</b> rep · ${r.clients} clients`}</div>
    </button>`).join("") || `<div class="reg-empty">No agents yet — register one above.</div>`;
  [...$("agentsList").children].forEach((el) => el.dataset && el.dataset.id && el.addEventListener("click", () => selectAgent(+el.dataset.id)));
}

/* ── center · agent drill-in ───────────────────────────────────────── */
function selectAgent(id) { sel = id; renderAgents(); renderAgentDetail(); $("classification").textContent = `AGENT #${id} · ${A.agentRef(id)}`; }

function renderAgentDetail() {
  if (sel == null) return;
  const a = A.state.agents.get(sel); if (!a) return;
  const { clients, summary } = repOf(sel);
  const fb = A.rep.readAllFeedback(sel, clients, "", "", true).feedback;
  const vals = A.val.getAgentValidations(sel).requests.map((h) => ({ h, ...A.val.getValidationStatus(h) }));
  const meta = [...a.metadata.entries()];

  $("agentDetail").innerHTML = `
    <!-- IDENTITY -->
    <section class="card">
      <div class="card-h"><span class="card-eyebrow">Identity Registry · ARC-72</span><span class="card-meta">#${sel}</span></div>
      <div class="kv"><span>agentRegistry</span><code>${esc(A.agentRef(sel))}</code></div>
      <div class="kv"><span>owner</span><code>${esc(a.owner)}</code></div>
      <div class="kv"><span>agentWallet</span><code>${a.agentWallet ? esc(a.agentWallet) : "— (cleared)"}</code></div>
      <div class="kv"><span>agentURI</span><code>${esc(a.agentURI) || "—"}</code></div>
      <div class="meta-table">
        <div class="mt-h">metadata <span>(owner/operator)</span></div>
        ${meta.length ? meta.map(([k, v]) => `<div class="mt-row"><code>${esc(k)}</code><code>${esc(typeof v === "string" ? v : JSON.stringify(v))}</code></div>`).join("") : `<div class="mt-empty">no metadata keys</div>`}
        <div class="mt-add"><input class="rb-input" id="mdKey" placeholder="key" /><input class="rb-input" id="mdVal" placeholder="value" /><button class="mini-btn" id="mdAdd">set</button></div>
      </div>
      <div class="card-actions">
        <span class="ca-field"><input class="rb-input" id="actURI" placeholder="new agentURI" /><button class="mini-btn" id="doURI">setAgentURI</button></span>
        <span class="ca-field"><input class="rb-input" id="actWallet" placeholder="new wallet addr" /><button class="mini-btn" id="doWallet">setAgentWallet</button></span>
        <span class="ca-field"><input class="rb-input" id="actTo" placeholder="transfer to addr" /><button class="mini-btn" id="doTransfer">transferFrom</button></span>
        <button class="mini-btn" id="doGenWallet" title="fill a fresh address">gen addr</button>
      </div>
    </section>

    <!-- REPUTATION -->
    <section class="card">
      <div class="card-h"><span class="card-eyebrow">Reputation Registry</span>
        <button class="score-pill" id="scorePill" title="click to see the transactions behind this score">
          ${summary.count ? `<b>${summary.summaryValue}</b> · ${summary.count} feedback ▸` : "unrated ▸"}
        </button></div>
      <div class="fb-list">
        ${fb.length ? fb.map((r) => `<button class="fb-row ${r.isRevoked ? "is-revoked" : ""}" data-client="${esc(r.client)}" data-idx="${r.feedbackIndex}">
            <span class="fb-val">${r.value}<small>·${r.valueDecimals}dp</small></span>
            <span class="fb-tags">${esc(r.tag1) || "—"}${r.tag2 ? " · " + esc(r.tag2) : ""}</span>
            <span class="fb-client">${short(r.client)} #${r.feedbackIndex}</span>
            ${r.isRevoked ? '<span class="fb-rev">revoked</span>' : ""}
          </button>`).join("") : `<div class="mt-empty">no feedback yet</div>`}
      </div>
      <div class="card-actions">
        <span class="ca-field"><input class="rb-input" id="fbVal" type="number" placeholder="value (e.g. 95)" /><input class="rb-input" id="fbTag" placeholder="tag1 (e.g. x402)" /><button class="mini-btn primary" id="doFeedback">giveFeedback</button></span>
        <span class="ca-hint">as <code>${short(A.caller)}</code> · x402 paymentTxid+nonce auto · self-feedback blocked for owner</span>
      </div>
    </section>

    <!-- VALIDATION -->
    <section class="card">
      <div class="card-h"><span class="card-eyebrow">Validation Registry</span><span class="card-meta">${vals.length} requests</span></div>
      <div class="val-list">
        ${vals.length ? vals.map((v) => `<button class="val-row" data-h="${esc(v.h)}">
            <span class="vr-resp ${v.response == null ? "pending" : (v.response >= 50 ? "ok" : "bad")}">${v.response == null ? "pending" : v.response + "/100"}</span>
            <span class="vr-validator">validator ${short(v.validator)}</span>
            <span class="vr-tag">${esc(v.tag) || "—"}</span>
          </button>`).join("") : `<div class="mt-empty">no validation requests</div>`}
      </div>
      <div class="card-actions">
        <span class="ca-field"><input class="rb-input" id="valValidator" placeholder="validator addr (blank = fresh)" /><button class="mini-btn" id="doValReq">validationRequest</button></span>
      </div>
    </section>`;

  wireDetail();
}

function wireDetail() {
  const id = sel;
  $("mdAdd").onclick = () => { guard(() => A.id.setMetadata(id, $("mdKey").value.trim(), $("mdVal").value)); refresh(); };
  $("doURI").onclick = () => { guard(() => A.id.setAgentURI(id, $("actURI").value.trim())); refresh(); };
  $("doWallet").onclick = () => { const w = $("actWallet").value.trim() || A.newAddr(); guard(() => A.id.setAgentWallet(id, w, Date.now() + 300000, "sig")); refresh(); };
  $("doGenWallet").onclick = () => { $("actWallet").value = A.newAddr(); };
  $("doTransfer").onclick = () => { const a = A.state.agents.get(id); guard(() => A.id.transferFrom(a.owner, $("actTo").value.trim() || A.newAddr(), id)); refresh(); };
  $("scorePill").onclick = () => openScore(id);
  $("doFeedback").onclick = () => {
    const v = $("fbVal").value.trim(); if (v === "") return toast("enter a value", true);
    const r = guard(() => A.rep.giveFeedback({ agentId: id, value: Number(v), valueDecimals: 0, tag1: $("fbTag").value.trim() || "x402", paymentTxid: A.newHash(52).toUpperCase().slice(0, 52), nonce: (Math.random() * 1e6) | 0 }));
    if (r) toast(`feedback #${r.feedbackIndex} recorded`); refresh();
  };
  $("doValReq").onclick = () => { const v = $("valValidator").value.trim() || A.newAddr(); const r = guard(() => A.val.validationRequest(v, id, "ipfs://req", "")); if (r) toast(`validation requested → ${short(v)}`); refresh(); };
  [...document.querySelectorAll(".fb-row")].forEach((el) => el.onclick = () => openFeedback(id, el.dataset.client, +el.dataset.idx));
  [...document.querySelectorAll(".val-row")].forEach((el) => el.onclick = () => openValidation(el.dataset.h));
}

/* ── modals · click-in detail ──────────────────────────────────────── */
function modal(eyebrow, title, html) { $("detailEyebrow").textContent = eyebrow; $("detailTitle").textContent = title; $("detailModalBody").innerHTML = html; $("detailModal").classList.add("is-open"); }
function closeModal() { $("detailModal").classList.remove("is-open"); }
function kvRows(obj) { return Object.entries(obj).map(([k, v]) => `<div class="lm-kv"><span>${esc(k)}</span><code>${esc(typeof v === "object" ? JSON.stringify(v) : v)}</code></div>`).join(""); }

function openScore(id) {   // the transactions behind a reputation score
  const evs = A.state.events.filter((e) => (e.registry === "reputation" || e.registry === "validation") && e.args.agentId === id);
  const { clients } = repOf(id);
  const fb = A.rep.readAllFeedback(id, clients, "", "", true).feedback;
  const txns = fb.map((r) => { const row = A.state.feedback.get(id).get(r.client)[r.feedbackIndex - 1]; return { client: short(r.client), idx: r.feedbackIndex, value: r.value, tag: r.tag1, paymentTxid: short(row.paymentTxid), nonce: row.nonce, revoked: r.isRevoked }; });
  modal("Reputation provenance", `Transactions behind agent #${id}`, `
    <p class="lm-mean">Reputation is the sum of these payment-anchored feedback transactions. Every one references an x402 settlement (paymentTxid + nonce) — earned, not self-reported.</p>
    ${txns.length ? `<table class="lm-table"><tr><th>client</th><th>#</th><th>value</th><th>tag</th><th>paymentTxid</th><th>nonce</th></tr>
      ${txns.map((t) => `<tr class="${t.revoked ? "is-rev" : ""}"><td>${t.client}</td><td>${t.idx}</td><td>${t.value}</td><td>${esc(t.tag)}</td><td>${t.paymentTxid}</td><td>${t.nonce}</td></tr>`).join("")}</table>` : `<p class="panel-placeholder">no feedback yet</p>`}
    <div class="lm-sub">ARC-28 events (${evs.length})</div>
    ${evs.map((e) => eventCardHTML(e)).join("")}`);
}
function openFeedback(id, client, idx) {
  const row = A.state.feedback.get(id).get(client)[idx - 1];
  modal("Reputation · NewFeedback", `Feedback #${idx} on agent #${id}`, kvRows({
    agentId: id, client, feedbackIndex: idx, value: row.value, valueDecimals: row.valueDecimals,
    tag1: row.tag1, tag2: row.tag2, feedbackHash: row.feedbackHash, feedbackURI: row.feedbackURI || "—",
    paymentTxid: row.paymentTxid, nonce: row.nonce, isRevoked: row.isRevoked, responses: row.responses.length,
  }) + `<div class="lm-actions">
      <button class="mini-btn" id="mResp">appendResponse (as ${short(A.caller)})</button>
      ${client === A.caller && !row.isRevoked ? `<button class="mini-btn" id="mRevoke">revokeFeedback (own)</button>` : ""}
    </div>`);
  $("mResp").onclick = () => { guard(() => A.rep.appendResponse(id, client, idx, "ipfs://resp", "")); toast("response appended"); refresh(); closeModal(); };
  if ($("mRevoke")) $("mRevoke").onclick = () => { guard(() => A.rep.revokeFeedback(id, idx)); toast("feedback revoked"); refresh(); closeModal(); };
}
function openValidation(h) {
  const v = A.val.getValidationStatus(h);
  modal("Validation · status", `Validation request`, kvRows({ requestHash: h, validator: v.validator, agentId: v.agentId, response: v.response ?? "pending", responseHash: v.responseHash || "—", tag: v.tag || "—" }) +
    `<div class="lm-actions"><input class="rb-input" id="mRespVal" type="number" placeholder="response 0..100" /><button class="mini-btn primary" id="mDoResp">validationResponse (as validator)</button></div>
     <p class="lm-mean">Respond as the named validator (${short(v.validator)}). Switch "acting as → validator" then set caller, or this will reject (self-validation / wrong caller).</p>`);
  $("mDoResp").onclick = () => { const r = $("mRespVal").value.trim(); const out = guard(() => A.val.validationResponse(h, Number(r), "ipfs://vr", "", "x402:settled")); if (out) { toast(`validation response ${r}/100`); refresh(); closeModal(); } };
}
function eventCardHTML(e) {
  return `<div class="evt-card" data-reg="${e.registry}"><div class="evt-top"><span class="evt-name">${e.registry}.${e.name}</span><a class="txid-link" href="${explorer(e.txid)}" target="_blank" rel="noopener">${short(e.txid)} ↗</a></div><div class="evt-args">${esc(JSON.stringify(e.args))}</div><div class="evt-meta">round r${e.round} · ${A.NET}</div></div>`;
}

/* ── right rail · transaction log ──────────────────────────────────── */
function renderEvents() {
  const list = A.state.events.filter((e) => evtFilter === "all" || e.registry === evtFilter);
  $("eventLog").innerHTML = list.length ? list.slice(0, 40).map((e, i) => `<button class="evt-card" data-i="${A.state.events.indexOf(e)}"><div class="evt-top"><span class="evt-name">${e.registry}.${e.name}</span><span class="evt-tx">${short(e.txid)}</span></div><div class="evt-args">${esc(JSON.stringify(e.args))}</div></button>`).join("") : `<div class="reg-empty">no transactions yet</div>`;
  [...$("eventLog").children].forEach((el) => el.dataset && el.dataset.i != null && (el.onclick = () => { const e = A.state.events[+el.dataset.i]; modal(`${e.registry} · ${e.name}`, "ARC-28 event", kvRows({ ...e.args }) + `<div class="lm-kv"><span>txid</span><a class="txid-link" href="${explorer(e.txid)}" target="_blank" rel="noopener">${e.txid} ↗</a></div><div class="lm-kv"><span>round</span><code>r${e.round} · ${A.NET}</code></div>`); }));
}

/* ── all-methods explorer (full ABI) ───────────────────────────────── */
const META = (s) => (s || "").split(",").map((p) => p.split("=")).filter((x) => x[0]);
const METHODS = [
  { ns: "id", fn: "register", sig: "register(agentURI, metadata[])", f: ["agentURI", "metadata k=v,k=v"], call: (v) => A.id.register(v[0], META(v[1])) },
  { ns: "id", fn: "setAgentURI", sig: "setAgentURI(agentId, newURI)", f: ["agentId", "newURI"], call: (v) => A.id.setAgentURI(+v[0], v[1]) },
  { ns: "id", fn: "getMetadata", sig: "getMetadata(agentId, key)", read: 1, f: ["agentId", "key"], call: (v) => A.id.getMetadata(+v[0], v[1]) },
  { ns: "id", fn: "setMetadata", sig: "setMetadata(agentId, key, value)", f: ["agentId", "key", "value"], call: (v) => A.id.setMetadata(+v[0], v[1], v[2]) },
  { ns: "id", fn: "setAgentWallet", sig: "setAgentWallet(agentId, newWallet, deadline, sig)", f: ["agentId", "newWallet", "deadline"], call: (v) => A.id.setAgentWallet(+v[0], v[1], +v[2] || Date.now() + 3e5, "sig") },
  { ns: "id", fn: "getAgentWallet", sig: "getAgentWallet(agentId)", read: 1, f: ["agentId"], call: (v) => A.id.getAgentWallet(+v[0]) },
  { ns: "id", fn: "unsetAgentWallet", sig: "unsetAgentWallet(agentId)", f: ["agentId"], call: (v) => A.id.unsetAgentWallet(+v[0]) },
  { ns: "id", fn: "isAuthorizedOrOwner", sig: "isAuthorizedOrOwner(spender, agentId)", read: 1, f: ["spender", "agentId"], call: (v) => A.id.isAuthorizedOrOwner(v[0], +v[1]) },
  { ns: "id", fn: "ownerOf", sig: "ownerOf(agentId)", read: 1, f: ["agentId"], call: (v) => A.id.ownerOf(+v[0]) },
  { ns: "id", fn: "balanceOf", sig: "balanceOf(owner)", read: 1, f: ["owner"], call: (v) => A.id.balanceOf(v[0]) },
  { ns: "id", fn: "approve", sig: "approve(to, agentId)", f: ["to", "agentId"], call: (v) => A.id.approve(v[0], +v[1]) },
  { ns: "id", fn: "setApprovalForAll", sig: "setApprovalForAll(operator, approved)", f: ["operator", "approved(true/false)"], call: (v) => A.id.setApprovalForAll(v[0], v[1] === "true") },
  { ns: "id", fn: "transferFrom", sig: "transferFrom(from, to, agentId)", f: ["from", "to", "agentId"], call: (v) => A.id.transferFrom(v[0], v[1], +v[2]) },
  { ns: "rep", fn: "giveFeedback", sig: "giveFeedback(agentId, value, …, paymentTxid, nonce)", f: ["agentId", "value", "valueDecimals", "tag1", "tag2", "paymentTxid", "nonce"], call: (v) => A.rep.giveFeedback({ agentId: +v[0], value: +v[1], valueDecimals: +v[2] || 0, tag1: v[3], tag2: v[4], paymentTxid: v[5] || A.newHash(), nonce: v[6] || ((Math.random() * 1e6) | 0) }) },
  { ns: "rep", fn: "revokeFeedback", sig: "revokeFeedback(agentId, feedbackIndex)", f: ["agentId", "feedbackIndex"], call: (v) => A.rep.revokeFeedback(+v[0], +v[1]) },
  { ns: "rep", fn: "appendResponse", sig: "appendResponse(agentId, client, idx, uri, hash)", f: ["agentId", "client", "feedbackIndex", "responseURI"], call: (v) => A.rep.appendResponse(+v[0], v[1], +v[2], v[3]) },
  { ns: "rep", fn: "getSummary", sig: "getSummary(agentId, clients[], tag1, tag2)", read: 1, f: ["agentId", "clients csv", "tag1", "tag2"], call: (v) => A.rep.getSummary(+v[0], v[1], v[2], v[3]) },
  { ns: "rep", fn: "readFeedback", sig: "readFeedback(agentId, client, idx)", read: 1, f: ["agentId", "client", "feedbackIndex"], call: (v) => A.rep.readFeedback(+v[0], v[1], +v[2]) },
  { ns: "rep", fn: "readAllFeedback", sig: "readAllFeedback(agentId, clients[], …)", read: 1, f: ["agentId", "clients csv", "tag1", "tag2", "includeRevoked(true/false)"], call: (v) => A.rep.readAllFeedback(+v[0], v[1], v[2], v[3], v[4] === "true") },
  { ns: "rep", fn: "getResponseCount", sig: "getResponseCount(agentId, client, idx)", read: 1, f: ["agentId", "client", "feedbackIndex"], call: (v) => A.rep.getResponseCount(+v[0], v[1], +v[2]) },
  { ns: "rep", fn: "getClients", sig: "getClients(agentId)", read: 1, f: ["agentId"], call: (v) => A.rep.getClients(+v[0]) },
  { ns: "rep", fn: "getLastIndex", sig: "getLastIndex(agentId, client)", read: 1, f: ["agentId", "client"], call: (v) => A.rep.getLastIndex(+v[0], v[1]) },
  { ns: "val", fn: "validationRequest", sig: "validationRequest(validator, agentId, uri, hash)", f: ["validator", "agentId", "requestURI"], call: (v) => A.val.validationRequest(v[0], +v[1], v[2]) },
  { ns: "val", fn: "validationResponse", sig: "validationResponse(requestHash, response, …)", f: ["requestHash", "response 0..100", "responseURI", "tag"], call: (v) => A.val.validationResponse(v[0], +v[1], v[2], "", v[3]) },
  { ns: "val", fn: "getValidationStatus", sig: "getValidationStatus(requestHash)", read: 1, f: ["requestHash"], call: (v) => A.val.getValidationStatus(v[0]) },
  { ns: "val", fn: "getSummary", sig: "getSummary(agentId, validators[], tag)", read: 1, f: ["agentId", "validators csv", "tag"], call: (v) => A.val.getSummary(+v[0], v[1], v[2]) },
  { ns: "val", fn: "getAgentValidations", sig: "getAgentValidations(agentId)", read: 1, f: ["agentId"], call: (v) => A.val.getAgentValidations(+v[0]) },
  { ns: "val", fn: "getValidatorRequests", sig: "getValidatorRequests(validator)", read: 1, f: ["validator"], call: (v) => A.val.getValidatorRequests(v[0]) },
];
const NS_LABEL = { id: "Identity Registry", rep: "Reputation Registry", val: "Validation Registry" };
function renderMethods() {
  const groups = ["id", "rep", "val"];
  $("methodsPanel").innerHTML = groups.map((g) => `
    <section class="card"><div class="card-h"><span class="card-eyebrow">${NS_LABEL[g]}</span><span class="card-meta">${METHODS.filter((m) => m.ns === g).length} methods</span></div>
      ${METHODS.filter((m) => m.ns === g).map((m, i) => { const mi = METHODS.indexOf(m); return `
        <div class="method" data-mi="${mi}">
          <div class="m-sig"><code>${esc(m.sig)}</code>${m.read ? '<span class="m-read">readonly</span>' : '<span class="m-write">write</span>'}</div>
          <div class="m-fields">${m.f.map((ph, j) => `<input class="rb-input m-in" data-mi="${mi}" data-j="${j}" placeholder="${esc(ph)}" />`).join("")}<button class="mini-btn ${m.read ? "" : "primary"} m-call" data-mi="${mi}">call</button></div>
          <pre class="m-out" id="mout-${mi}"></pre>
        </div>`; }).join("")}
    </section>`).join("");
  [...document.querySelectorAll(".m-call")].forEach((b) => b.onclick = () => {
    const mi = +b.dataset.mi, m = METHODS[mi];
    const vals = m.f.map((_, j) => { const el = document.querySelector(`.m-in[data-mi="${mi}"][data-j="${j}"]`); return el ? el.value.trim() : ""; });
    try { const r = m.call(vals); $(`mout-${mi}`).textContent = JSON.stringify(r, null, 2); $(`mout-${mi}`).classList.remove("err"); refresh(false); }
    catch (e) { $(`mout-${mi}`).textContent = "✕ " + e.message; $(`mout-${mi}`).classList.add("err"); }
  });
  // prefill agentId fields with selection
  if (sel != null) [...document.querySelectorAll(".m-in")].forEach((el) => { const m = METHODS[+el.dataset.mi]; if (m.f[+el.dataset.j] === "agentId" && !el.value) el.value = sel; });
}

/* ── caller / admin switching ──────────────────────────────────────── */
function setCaller(addr, role) { A.setCaller(addr); callerRole = role; $("callerShort").textContent = short(A.caller); $("callerRole").textContent = role; }
function refresh(full = true) { renderAgents(); renderEvents(); if (full && sel != null) renderAgentDetail(); renderReceipt(); }
function renderReceipt() { $("frameReceipt").innerHTML = `<span class="fr-glyph">◇</span><span class="fr-strong">ARC-8004 console</span><span class="fr-sep">·</span><span>${A.state.agents.size} agents · ${A.state.events.length} txns</span><span class="fr-sep">·</span><span>acting as ${short(A.caller)} (${callerRole})</span><span class="fr-right">click any score / row / event to drill in</span>`; }

/* ── boot ──────────────────────────────────────────────────────────── */
function boot() {
  A.seed();
  setCaller(A.caller, "admin");
  $("registerBtn").onclick = () => {
    const name = $("newAgentName").value.trim() || `Agent ${A.state.nextId}`;
    setCaller(A.newAddr(), "owner");
    const r = A.id.register($("newAgentURI").value.trim() || "ipfs://card", [["name", name]]);
    $("newAgentName").value = ""; $("newAgentURI").value = "";
    toast(`registered agent #${r.agentId}`); selectAgent(r.agentId);
  };
  $("actOwner").onclick = () => { if (sel == null) return toast("select an agent first", true); setCaller(A.state.agents.get(sel).owner, "owner"); toast(`acting as owner of #${sel}`); refresh(); };
  $("actClient").onclick = () => { setCaller(A.newAddr(), "client"); toast("acting as a fresh client"); refresh(); };
  $("actValidator").onclick = () => { setCaller(A.newAddr(), "validator"); toast("acting as a fresh validator"); refresh(); };

  [...document.querySelectorAll(".console-tab")].forEach((t) => t.onclick = () => {
    [...document.querySelectorAll(".console-tab")].forEach((x) => x.classList.remove("is-active")); t.classList.add("is-active");
    const v = t.dataset.view; $("viewAgent").hidden = v !== "agent"; $("viewMethods").hidden = v !== "methods";
    if (v === "methods") renderMethods();
  });
  [...document.querySelectorAll(".ef-chip")].forEach((c) => c.onclick = () => { [...document.querySelectorAll(".ef-chip")].forEach((x) => x.classList.remove("is-active")); c.classList.add("is-active"); evtFilter = c.dataset.f; renderEvents(); });

  $("detailModalClose").onclick = closeModal;
  $("detailModal").addEventListener("click", (e) => { if (e.target.id === "detailModal") closeModal(); });
  $("presentToggle").onclick = () => document.body.classList.toggle("present");
  $("agentsPill").onclick = () => { const t = document.querySelector('.console-tab[data-view="methods"]'); t.click(); };
  document.addEventListener("keydown", (e) => { if (e.target.matches("input,textarea")) return; if (e.key === "Escape") closeModal(); else if (e.key === "p" || e.key === "P") document.body.classList.toggle("present"); });

  A.subscribe(() => { renderAgents(); renderEvents(); renderReceipt(); });
  const first = [...A.state.agents.keys()][0]; if (first != null) selectAgent(first); else refresh();
  requestAnimationFrame(() => document.body.classList.add("ready"));
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
