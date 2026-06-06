/*
 * registry.js · ARC-8004 Agent Registry · role-adaptive console.
 * Two surfaces, two jobs:
 *   Marketplace (client) — discover agents, judge trust, rate ones you paid.
 *   Manage (owner)       — register & run your agents; respond to feedback.
 * Progressive disclosure: actions stay collapsed until requested.
 * Renders into three fixed panes (#railLeft / #center / #railRight) per view.
 */
const A = window.ARC8004;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const short = (s) => (s ? `${s.slice(0, 6)}…${s.slice(-4)}` : '—');
const explorer = (tx) => `https://lora.algokit.io/${A.NET}/transaction/${tx}`;
const cp = (v) => `class="copyable" data-copy="${esc(v)}" title="click to copy"`;
const uriLink = (u) => { if (!u) return '—'; if (!/^(https?:|ipfs:)/i.test(u)) return esc(u); const href = u.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${u.slice(7)}` : u; return `<a class="uri-link" href="${esc(href)}" target="_blank" rel="noopener">${esc(u)} ↗</a>`; };
const regClass = (r) => `reg-${String(r || 'default').toLowerCase()}`;
const scoreClass = (s) => (s == null ? 'score-na' : s >= 75 ? 'score-hi' : s >= 50 ? 'score-mid' : 'score-lo');

const state = { view: 'marketplace', sel: null, q: '', reg: 'all', sort: 'rep', sat: null, ownerView: null };
const trustTip = (t) => t.total ? `Trust = % of verified buyers satisfied · ${t.satisfied}/${t.total} satisfied · one review per proof-of-payment` : 'No verified reviews yet';
let toastTimer = null;
function toast(msg, bad) { const t = $('toast'), m = $('toast-msg'); m.textContent = msg; t.classList.toggle('is-bad', !!bad); t.classList.add('is-shown'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('is-shown'), 3200); }
function copy(text) { try { navigator.clipboard.writeText(text); toast('copied'); } catch (_) { toast('copy failed', true); } }
function guard(fn) { try { return fn(); } catch (e) { toast(e.message, true); return null; } }

/* ── data helpers ───────────────────────────────────────────────────── */
const nameOf = (id) => (A.state.agents.get(id)?.metadata.get('name')) || `agent #${id}`;
const regOf = (id) => (A.state.agents.get(id)?.metadata.get('register')) || '—';
function repOf(id) {
  const t = A.rep.trust(id);                 // score = % of verified buyers satisfied
  const valAvg = A.val.getSummary(id, []).averageResponse;
  return { count: t.total, satisfied: t.satisfied, score: t.score, valAvg, tip: trustTip(t) };
}
function renderChainCtx() {
  const net = (A.NET || 'testnet');
  $('chainCtx').innerHTML = `
    <div class="cc-net cc-${net}"><span class="cc-dot"></span>ALGORAND · ${net.toUpperCase()} <span class="cc-mode">mock</span></div>
    <div class="cc-apps">
      <div class="cc-app"><span>Identity</span><code ${cp(String(A.APP.identity))}>app ${A.APP.identity}</code></div>
      <div class="cc-app"><span>Reputation</span><code ${cp(String(A.APP.reputation))}>app ${A.APP.reputation}</code></div>
      <div class="cc-app"><span>Validation</span><code ${cp(String(A.APP.validation))}>app ${A.APP.validation}</code></div>
    </div>`;
}
const allAgents = () => [...A.state.agents.keys()];
const registers = () => ['all', ...new Set(allAgents().map(regOf).filter((r) => r && r !== '—'))];

/* ── chrome ─────────────────────────────────────────────────────────── */
function renderChrome() {
  [...document.querySelectorAll('.console-tab')].forEach((t) => t.classList.toggle('is-active', t.dataset.view === state.view));
  const roleMap = { manage: ['managing as', 'owner'], methods: ['caller', 'developer'], admin: ['observing as', 'admin'], marketplace: ['browsing as', 'client'] };
  const [role, hint] = roleMap[state.view] || roleMap.marketplace;
  if ($('roleHint')) $('roleHint').textContent = hint;
  if (!$('identityChip')) return;
  $('identityChip').innerHTML = `<span class="idc-role">${role}</span> <code ${cp(A.caller)}>${short(A.caller)}</code> <span class="idc-fixed" title="One consistent wallet — no impersonation">🔒 connected</span>`;
  $('frameReceipt').innerHTML = `<span class="fr-glyph">◇</span><span class="fr-strong">${A.state.agents.size} agents</span><span class="fr-sep">·</span><span>${A.state.events.length} on-chain events</span><span class="fr-right">click a score / row to drill in · P present</span>`;
}

/* ── MARKETPLACE (client) ───────────────────────────────────────────── */
function marketRows() {
  let rows = allAgents().map((id) => ({ id, ...repOf(id), name: nameOf(id), reg: regOf(id) }));
  if (state.reg !== 'all') rows = rows.filter((r) => r.reg === state.reg);
  if (state.q) { const q = state.q.toLowerCase(); rows = rows.filter((r) => `${r.name} #${r.id} ${r.reg}`.toLowerCase().includes(q)); }
  rows.sort((a, b) => state.sort === 'validation' ? b.valAvg - a.valAvg : state.sort === 'feedback' ? b.count - a.count : (b.score ?? -1) - (a.score ?? -1));
  return rows;
}
const marketGridHTML = () => marketRows().map(marketCard).join('') || `<div class="empty-note">No agents match.</div>`;
function renderMarketplace() {
  const rows = marketRows();
  $('railLeft').innerHTML = `
    <div class="rail-header"><span>Discover</span><span class="rh-meta">${rows.length}</span></div>
    <div class="pane-pad">
      <input class="rb-input" id="q" data-action="search" placeholder="search agents…" value="${esc(state.q)}" />
      <div class="chip-row">${registers().map((r) => `<button class="reg-chip ${regClass(r)} ${state.reg === r ? 'is-active' : ''}" data-action="filter-reg" data-reg="${esc(r)}">${esc(r)}</button>`).join('')}</div>
      <label class="flabel">Sort by</label>
      <select class="rb-select" id="sort" data-action="filter-sort">
        <option value="rep" ${state.sort === 'rep' ? 'selected' : ''}>reputation</option>
        <option value="validation" ${state.sort === 'validation' ? 'selected' : ''}>validation</option>
        <option value="feedback" ${state.sort === 'feedback' ? 'selected' : ''}>most reviewed</option>
      </select>
    </div>`;

  // center — grid OR client detail
  if (state.sel != null) { renderClientDetail(state.sel); }
  else {
    $('center').innerHTML = `
      <div class="view-head"><h1 class="big-title">Marketplace</h1><p class="big-sub">Pick an agent by <em>earned</em> trust — every review is tied to a proof-of-payment.</p></div>
      <p class="trust-note" title="Trust = % of verified buyers satisfied · one review per x402 proof-of-payment · hover any score for the breakdown.">ⓘ <strong>Trust</strong> = % of verified buyers satisfied · one review per x402 proof-of-payment · hover a score for its breakdown.</p>
      <div class="market-grid">${marketGridHTML()}</div>`;
  }

  // right — recent on-chain activity
  $('railRight').innerHTML = `
    <div class="rail-right-header"><span class="agency-label">◇ RECENT ACTIVITY</span><span class="live-indicator">live</span></div>
    <div class="mini-log">${A.state.events.slice(0, 10).map((e) => `<div class="mini-evt"><span class="me-name">${e.registry}.${e.name}</span><span class="me-tx">${short(e.txid)}</span></div>`).join('') || '<div class="empty-note">—</div>'}</div>`;
}

function marketCard(r) {
  return `<button class="agent-card ${regClass(r.reg)}" data-action="open-agent" data-id="${r.id}">
    <div class="ac-top"><span class="reg-badge ${regClass(r.reg)}">${esc(r.reg)}</span>${r.count ? `<span class="ac-verified">✓ ${r.count} verified</span>` : '<span class="ac-new">new</span>'}</div>
    <div class="ac-name">${esc(r.name)}</div>
    <div class="ac-scorewrap"><span class="ac-score ${scoreClass(r.score)}" title="${esc(r.tip)}">${r.score == null ? '—' : r.score + '%'}</span><span class="ac-scorelbl">satisfied</span></div>
    <div class="ac-bar"><i class="${scoreClass(r.score)}" style="width:${r.score ?? 0}%"></i></div>
  </button>`;
}

function renderClientDetail(id) {
  const a = A.state.agents.get(id); if (!a) { state.sel = null; return renderMarketplace(); }
  const r0 = repOf(id);
  const clients = A.rep.getClients(id).clients;
  const fb = A.rep.readAllFeedback(id, clients, '', '', false).feedback;
  const reg = regOf(id);
  const isOwner = a.owner === A.caller;
  const receipts = A.proof.receipts(id, A.caller);
  $('center').innerHTML = `
    <button class="back-link" data-action="back">← Marketplace</button>
    <div class="detail-hero ${regClass(reg)}">
      <span class="reg-badge ${regClass(reg)}">${esc(reg)}</span>
      <h1 class="big-title">${esc(nameOf(id))}</h1>
      <div class="hero-score"><span class="ac-score ${scoreClass(r0.score)}" title="${esc(r0.tip)}">${r0.score == null ? '—' : r0.score + '%'}</span><span class="ac-scorelbl">of ${r0.count} verified buyers satisfied</span>
        <button class="link-btn" data-action="open-score" data-id="${id}">see the transactions ▸</button></div>
    </div>

    <section class="card soft">
      <div class="card-eyebrow">Identity</div>
      <div class="kv"><span>owner</span><code ${cp(a.owner)}>${short(a.owner)}</code></div>
      <div class="kv"><span>agentURI</span><span class="kv-uri">${uriLink(a.agentURI)}</span></div>
      <div class="kv"><span>registry</span><code ${cp(A.agentRef(id))}>${short(A.agentRef(id))}</code></div>
    </section>

    <section class="card soft">
      <div class="card-eyebrow">Verified reviews</div>
      <div class="fb-list">${fb.slice(0, 8).map((r) => `<div class="fb-row">
        <span class="sat ${r.satisfied ? 'yes' : 'no'}">${r.satisfied ? '👍 satisfied' : '👎 not'}</span>
        <span class="fb-client">${short(r.client)}</span>
        <span class="fb-proof" ${cp(r.paymentTxid)} title="proof-of-payment ${esc(r.paymentTxid)}">⛓ ${short(r.paymentTxid)}</span>
      </div>`).join('') || '<div class="empty-note">No reviews yet.</div>'}</div>
    </section>

    <section class="card accent">
      <div class="card-eyebrow">Leave a review</div>
      ${isOwner
        ? `<p class="empty-note">You own this agent — you can't review your own (self-review is blocked).</p>`
        : `<p class="hint">A review needs a <strong>proof-of-payment</strong> — an x402 job you paid this agent for. We verify the hash on submit: it must be a payment <em>to this agent</em> sent <em>by you</em>, and each proof can be used once.</p>
           <div class="receipts">${receipts.length ? `<span class="rc-label">your receipts:</span>${receipts.map((p) => `<button class="receipt-chip" data-action="use-receipt" data-tx="${p.txid}">⛓ ${short(p.txid)}</button>`).join('')}` : '<span class="rc-label muted">no receipts yet —</span>'}<button class="mini-btn" data-action="simulate-pay" data-id="${id}">＋ pay for a job (x402)</button></div>
           <button class="disc-btn primary" data-toggle="rateForm">★ Write a review</button>
           <div id="rateForm" class="disc-panel" hidden>
             <div class="sentiment"><button class="sent-btn ${state.sat === 1 ? 'is-on yes' : ''}" data-action="set-sat" data-v="1">👍 Satisfied</button><button class="sent-btn ${state.sat === 0 ? 'is-on no' : ''}" data-action="set-sat" data-v="0">👎 Not satisfied</button></div>
             <input class="rb-input" id="proofTx" placeholder="proof-of-payment transaction hash" />
             <button class="mini-btn primary" data-action="give-feedback" data-id="${id}">Submit verified review</button>
           </div>`}
    </section>`;
}

/* ── MANAGE (owner) ─────────────────────────────────────────────────── */
function renderManage() {
  const owners = [...new Set(allAgents().map((id) => A.state.agents.get(id).owner))];
  const focusOwner = state.ownerView && owners.includes(state.ownerView) ? state.ownerView : A.caller;
  const isMe = focusOwner === A.caller;
  const owned = A.id.agentsOf(focusOwner);                 // fetch this owner's agents
  $('railLeft').innerHTML = `
    <div class="rail-header"><span>Owner</span><span class="rh-meta">${owned.length} agents</span></div>
    <div class="pane-pad">
      <div class="owner-card ${isMe ? 'is-me' : ''}">
        <span class="oc-label">${isMe ? 'managing as you' : 'viewing owner · read-only'}</span>
        <code ${cp(focusOwner)}>${short(focusOwner)}</code>
      </div>
      <label class="flabel">View another owner</label>
      <select class="rb-select" id="ownerSel" data-action="pick-owner">${owners.map((o) => `<option value="${o}" ${o === focusOwner ? 'selected' : ''}>${short(o)} · ${A.id.agentsOf(o).length} agents${o === A.caller ? ' · you' : ''}</option>`).join('')}</select>
      <button class="disc-btn primary block" data-toggle="registerForm">＋ Register a new agent</button>
      <div id="registerForm" class="disc-panel" hidden>
        <input class="rb-input" id="regName" placeholder="agent name" />
        <input class="rb-input" id="regURI" placeholder="agentURI (ipfs:// · https://)" />
        <select class="rb-select" id="regRegister">${['Diligence', 'Outreach', 'Judgment', 'Operations'].map((r) => `<option>${r}</option>`).join('')}</select>
        <button class="mini-btn primary" data-action="register">Register (you become owner)</button>
      </div>
    </div>
    <div class="rail-subhead">This owner's agents</div>
    <div class="owned-list">${owned.map((id) => `<button class="owned-link ${regClass(regOf(id))}" data-action="focus-agent" data-id="${id}">${esc(nameOf(id))} <span class="ol-id">#${id}</span></button>`).join('') || '<div class="empty-note">none</div>'}</div>`;

  const list = state.sel != null && owned.includes(state.sel) ? [state.sel] : owned;
  $('center').innerHTML = `
    <div class="view-head"><h1 class="big-title">Manage</h1><p class="big-sub">Agents owned by <em>${short(focusOwner)}</em>${isMe ? ' (you)' : ''} — identity, metadata, and reviews received.</p></div>
    ${list.length ? list.map(manageCard).join('') : `<div class="empty-note">This owner has no agents. Register one on the left, or pick another owner.</div>`}`;

  const recvd = owned.reduce((n, id) => n + repOf(id).count, 0);
  $('railRight').innerHTML = `
    <div class="rail-right-header"><span class="agency-label">◇ OWNER STANDING</span></div>
    <div class="pane-pad stat-block">
      <div class="stat"><span class="stat-n">${owned.length}</span><span class="stat-l">agents owned</span></div>
      <div class="stat"><span class="stat-n">${recvd}</span><span class="stat-l">reviews received</span></div>
    </div>`;
}

function manageCard(id) {
  const a = A.state.agents.get(id); const reg = regOf(id);
  const isOwner = a.owner === A.caller;
  const { clients } = repOf(id);
  const fb = A.rep.readAllFeedback(id, clients, '', '', true).feedback;
  const meta = [...a.metadata.entries()].filter(([k]) => k !== 'name' && k !== 'register');
  const vals = A.val.getAgentValidations(id).requests.map((h) => ({ h, ...A.val.getValidationStatus(h) }));
  return `<section class="manage-card ${regClass(reg)}">
    <div class="mc-head">
      <div><span class="reg-badge ${regClass(reg)}">${esc(reg)}</span><h2 class="mc-name">${esc(nameOf(id))}</h2></div>
      <span class="mc-id">#${id}</span>
    </div>
    ${!isOwner ? `<div class="owner-gate">You don't own this agent — read-only. Only its owner (${short(a.owner)}) can edit.</div>` : ''}

    <div class="mc-section">
      <div class="mc-row"><span class="mc-k">owner</span><code ${cp(a.owner)}>${short(a.owner)}</code></div>
      <div class="mc-row"><span class="mc-k">wallet</span><code ${a.agentWallet ? cp(a.agentWallet) : ''}>${a.agentWallet ? short(a.agentWallet) : '— cleared'}</code></div>
      <div class="mc-row"><span class="mc-k">agentURI</span><span class="mc-uri">${uriLink(a.agentURI)}</span></div>
      ${isOwner ? `
        <button class="disc-btn" data-toggle="edit-${id}">✎ Edit identity</button>
        <div id="edit-${id}" class="disc-panel" hidden>
          <div class="form-row"><input class="rb-input" id="uri-${id}" placeholder="new agentURI" /><button class="mini-btn" data-action="set-uri" data-id="${id}">set URI</button></div>
          <div class="form-row"><input class="rb-input" id="wal-${id}" placeholder="new wallet (blank = generate)" /><button class="mini-btn" data-action="set-wallet" data-id="${id}">set wallet</button></div>
          <div class="form-row"><input class="rb-input" id="to-${id}" placeholder="transfer to address" /><button class="mini-btn" data-action="transfer" data-id="${id}">transfer</button></div>
        </div>` : ''}
    </div>

    <div class="mc-section">
      <div class="mc-eyebrow">Metadata</div>
      ${meta.length ? meta.map(([k, v]) => `<div class="mc-row"><span class="mc-k">${esc(k)}</span><code>${esc(typeof v === 'string' ? v : JSON.stringify(v))}</code></div>`).join('') : '<div class="empty-note tight">no custom keys</div>'}
      ${isOwner ? `
        <button class="disc-btn" data-toggle="meta-${id}">＋ Add key/value</button>
        <div id="meta-${id}" class="disc-panel" hidden>
          <div class="form-row"><input class="rb-input" id="mk-${id}" placeholder="key" /><input class="rb-input" id="mv-${id}" placeholder="value" /><button class="mini-btn" data-action="add-meta" data-id="${id}">set</button></div>
        </div>` : ''}
    </div>

    <div class="mc-section">
      <div class="mc-eyebrow">Reviews received <span class="mc-count">${fb.length}</span></div>
      <div class="fb-list">${fb.slice(0, 5).map((r) => `<div class="fb-row ${r.isRevoked ? 'is-revoked' : ''}">
        <span class="sat ${r.satisfied ? 'yes' : 'no'}">${r.satisfied ? '👍' : '👎'}</span><span class="fb-client">${short(r.client)} #${r.feedbackIndex}</span><span class="fb-proof" ${cp(r.paymentTxid)} title="proof ${esc(r.paymentTxid)}">⛓ ${short(r.paymentTxid)}</span>
        ${isOwner ? `<button class="row-btn" data-toggle="resp-${id}-${r.feedbackIndex}">reply</button>` : ''}
        </div>${isOwner ? `<div id="resp-${id}-${r.feedbackIndex}" class="disc-panel inline" hidden><div class="form-row"><input class="rb-input" id="ru-${id}-${r.feedbackIndex}" placeholder="response note" /><button class="mini-btn" data-action="respond" data-id="${id}" data-client="${esc(r.client)}" data-idx="${r.feedbackIndex}">post reply</button></div></div>` : ''}`).join('') || '<div class="empty-note tight">no reviews yet</div>'}</div>
    </div>

    <div class="mc-section">
      <div class="mc-eyebrow">Validations <span class="mc-count">${vals.length}</span></div>
      ${vals.map((v) => `<div class="val-row" data-action="open-validation" data-h="${esc(v.h)}"><span class="vr-resp ${v.response == null ? 'pending' : v.response >= 50 ? 'ok' : 'bad'}">${v.response == null ? 'pending' : v.response + '/100'}</span><span class="vr-validator">${short(v.validator)}</span></div>`).join('') || '<div class="empty-note tight">none</div>'}
      ${isOwner ? `
        <button class="disc-btn" data-toggle="val-${id}">＋ Request validation</button>
        <div id="val-${id}" class="disc-panel" hidden><div class="form-row"><input class="rb-input" id="vv-${id}" placeholder="validator address (blank = generate)" /><button class="mini-btn" data-action="request-val" data-id="${id}">request</button></div></div>` : ''}
    </div>
  </section>`;
}

/* ── METHODS (advanced ABI) ─────────────────────────────────────────── */
const META = (s) => (s || '').split(',').map((p) => p.split('=')).filter((x) => x[0]);
const METHODS = [
  { ns: 'id', sig: 'register(agentURI, metadata)', f: ['agentURI', 'meta k=v,k=v'], call: (v) => A.id.register(v[0], META(v[1])) },
  { ns: 'id', sig: 'setAgentURI(agentId, uri)', f: ['agentId', 'uri'], call: (v) => A.id.setAgentURI(+v[0], v[1]) },
  { ns: 'id', sig: 'getMetadata(agentId, key)', read: 1, f: ['agentId', 'key'], call: (v) => A.id.getMetadata(+v[0], v[1]) },
  { ns: 'id', sig: 'setMetadata(agentId, key, value)', f: ['agentId', 'key', 'value'], call: (v) => A.id.setMetadata(+v[0], v[1], v[2]) },
  { ns: 'id', sig: 'setAgentWallet(agentId, wallet, deadline)', f: ['agentId', 'wallet', 'deadline'], call: (v) => A.id.setAgentWallet(+v[0], v[1], +v[2] || Date.now() + 3e5, 'sig') },
  { ns: 'id', sig: 'getAgentWallet(agentId)', read: 1, f: ['agentId'], call: (v) => A.id.getAgentWallet(+v[0]) },
  { ns: 'id', sig: 'ownerOf(agentId)', read: 1, f: ['agentId'], call: (v) => A.id.ownerOf(+v[0]) },
  { ns: 'id', sig: 'balanceOf(owner)', read: 1, f: ['owner'], call: (v) => A.id.balanceOf(v[0]) },
  { ns: 'id', sig: 'approve(to, agentId)', f: ['to', 'agentId'], call: (v) => A.id.approve(v[0], +v[1]) },
  { ns: 'id', sig: 'transferFrom(from, to, agentId)', f: ['from', 'to', 'agentId'], call: (v) => A.id.transferFrom(v[0], v[1], +v[2]) },
  { ns: 'id', sig: 'isAuthorizedOrOwner(spender, agentId)', read: 1, f: ['spender', 'agentId'], call: (v) => A.id.isAuthorizedOrOwner(v[0], +v[1]) },
  { ns: 'rep', sig: 'giveFeedback(agentId, value, …, paymentTxid, nonce)', f: ['agentId', 'value', 'tag1', 'paymentTxid', 'nonce'], call: (v) => A.rep.giveFeedback({ agentId: +v[0], value: +v[1], tag1: v[2], paymentTxid: v[3] || A.newHash(), nonce: v[4] || ((Math.random() * 1e6) | 0) }) },
  { ns: 'rep', sig: 'revokeFeedback(agentId, idx)', f: ['agentId', 'feedbackIndex'], call: (v) => A.rep.revokeFeedback(+v[0], +v[1]) },
  { ns: 'rep', sig: 'appendResponse(agentId, client, idx, uri)', f: ['agentId', 'client', 'feedbackIndex', 'responseURI'], call: (v) => A.rep.appendResponse(+v[0], v[1], +v[2], v[3]) },
  { ns: 'rep', sig: 'getSummary(agentId, clients[], tag1, tag2)', read: 1, f: ['agentId', 'clients csv', 'tag1', 'tag2'], call: (v) => A.rep.getSummary(+v[0], v[1], v[2], v[3]) },
  { ns: 'rep', sig: 'readFeedback(agentId, client, idx)', read: 1, f: ['agentId', 'client', 'feedbackIndex'], call: (v) => A.rep.readFeedback(+v[0], v[1], +v[2]) },
  { ns: 'rep', sig: 'getClients(agentId)', read: 1, f: ['agentId'], call: (v) => A.rep.getClients(+v[0]) },
  { ns: 'rep', sig: 'getLastIndex(agentId, client)', read: 1, f: ['agentId', 'client'], call: (v) => A.rep.getLastIndex(+v[0], v[1]) },
  { ns: 'val', sig: 'validationRequest(validator, agentId, uri)', f: ['validator', 'agentId', 'requestURI'], call: (v) => A.val.validationRequest(v[0], +v[1], v[2]) },
  { ns: 'val', sig: 'validationResponse(requestHash, response, tag)', f: ['requestHash', 'response', 'tag'], call: (v) => A.val.validationResponse(v[0], +v[1], '', '', v[2]) },
  { ns: 'val', sig: 'getValidationStatus(requestHash)', read: 1, f: ['requestHash'], call: (v) => A.val.getValidationStatus(v[0]) },
  { ns: 'val', sig: 'getSummary(agentId, validators[], tag)', read: 1, f: ['agentId', 'validators csv', 'tag'], call: (v) => A.val.getSummary(+v[0], v[1], v[2]) },
  { ns: 'val', sig: 'getAgentValidations(agentId)', read: 1, f: ['agentId'], call: (v) => A.val.getAgentValidations(+v[0]) },
];
const NSL = { id: 'Identity', rep: 'Reputation', val: 'Validation' };
const APPOF = { id: 'identity', rep: 'reputation', val: 'validation' };
function renderContracts() {
  $('railLeft').innerHTML = `<div class="rail-header"><span>Deployed contracts</span></div><div class="pane-pad">
    <div class="contract-app reg-diligence"><span class="ca-name">Identity</span><code ${cp(String(A.APP.identity))}>app ${A.APP.identity}</code><span class="ca-kind">ARC-72</span></div>
    <div class="contract-app reg-judgment"><span class="ca-name">Reputation</span><code ${cp(String(A.APP.reputation))}>app ${A.APP.reputation}</code><span class="ca-kind">ARC-28</span></div>
    <div class="contract-app reg-outreach"><span class="ca-name">Validation</span><code ${cp(String(A.APP.validation))}>app ${A.APP.validation}</code><span class="ca-kind">ARC-28</span></div>
    <p class="hint">Calls run as <code ${cp(A.caller)}>${short(A.caller)}</code> · <span class="cc-mode">mock</span> ids until deployed.</p></div>`;
  $('railRight').innerHTML = '';
  $('center').innerHTML = `<div class="view-head"><h1 class="big-title">Contracts</h1><p class="big-sub">The ARC-8004 on-chain surface — call every method with the spec guards.</p></div>` +
    ['id', 'rep', 'val'].map((g) => `<section class="card"><div class="card-eyebrow">${NSL[g]} Registry</div>${METHODS.map((m) => METHODS.indexOf(m)).filter((mi) => METHODS[mi].ns === g).map((mi) => { const m = METHODS[mi]; return `
      <div class="method"><div class="m-sig"><code>${esc(m.sig)}</code><span class="${m.read ? 'm-read' : 'm-write'}">${m.read ? 'read' : 'write'}</span></div>
        <div class="m-fields">${m.f.map((ph, j) => `<input class="rb-input m-in" data-mi="${mi}" data-j="${j}" placeholder="${esc(ph)}" />`).join('')}<button class="mini-btn ${m.read ? '' : 'primary'}" data-action="call-method" data-mi="${mi}">call</button></div>
        <pre class="m-out" id="mout-${mi}"></pre></div>`; }).join('')}</section>`).join('');
}

/* ── modals (drill-in) ──────────────────────────────────────────────── */
function modal(eyebrow, title, html) { $('detailEyebrow').textContent = eyebrow; $('detailTitle').textContent = title; $('detailModalBody').innerHTML = html; $('detailModal').classList.add('is-open'); }
function closeModal() { $('detailModal').classList.remove('is-open'); }
function kvRows(o) { return Object.entries(o).map(([k, v]) => { const val = typeof v === 'object' ? JSON.stringify(v) : v; return `<div class="lm-kv"><span>${esc(k)}</span><code ${cp(val)}>${esc(val)}</code></div>`; }).join(''); }
function openScore(id) {
  const clients = A.rep.getClients(id).clients;
  const fb = A.rep.readAllFeedback(id, clients, '', '', true).feedback;
  const t = A.rep.trust(id);
  modal('Reputation provenance', `How ${nameOf(id)}'s trust is built`, `
    <p class="lm-mean">Trust = <b>${t.score == null ? '—' : t.score + '%'}</b> — ${t.satisfied} of ${t.total} verified buyers satisfied. Each review is tied to an x402 proof-of-payment; one review per transaction.</p>
    ${fb.length ? `<table class="lm-table"><tr><th>buyer</th><th>verdict</th><th>proof-of-payment</th></tr>${fb.map((r) => `<tr class="${r.isRevoked ? 'is-rev' : ''}"><td>${short(r.client)}</td><td>${r.satisfied ? '👍 satisfied' : '👎 not'}</td><td>${short(r.paymentTxid)}</td></tr>`).join('')}</table>` : '<p class="empty-note">no reviews yet</p>'}`);
}
function openValidation(h) {
  const v = A.val.getValidationStatus(h);
  modal('Validation', 'Validation request', kvRows({ requestHash: h, validator: v.validator, agentId: v.agentId, response: v.response ?? 'pending', tag: v.tag || '—' }) +
    `<div class="lm-actions"><input class="rb-input" id="mResp" type="number" placeholder="response 0–100" /><button class="mini-btn primary" data-action="modal-validate" data-h="${esc(h)}">respond as validator</button></div>`);
}

/* ── actions (delegation) ───────────────────────────────────────────── */
function focusAgent(id) { state.sel = id; render(); }
const valById = (id) => ($(id) ? $(id).value.trim() : '');

const ACTIONS = {
  view: (el) => { state.view = el.dataset.view; state.sel = null; render(); },
  search: () => {}, // handled by input listener
  'filter-reg': (el) => { state.reg = el.dataset.reg; render(); },
  'open-agent': (el) => { state.sel = +el.dataset.id; render(); },
  back: () => { state.sel = null; render(); },
  'focus-agent': (el) => focusAgent(+el.dataset.id),
  'open-score': (el) => openScore(+el.dataset.id),
  'open-validation': (el) => openValidation(el.dataset.h),
  register: () => { const name = valById('regName') || `Agent ${A.state.nextId}`; const r = A.id.register(valById('regURI') || 'ipfs://card', [['name', name], ['register', $('regRegister').value]]); toast(`registered #${r.agentId} — you are the owner`); state.ownerView = A.caller; state.sel = r.agentId; render(); },
  // verified review: requires satisfied + a proof-of-payment txid (checked in giveFeedback)
  'set-sat': (el) => { state.sat = +el.dataset.v; [...document.querySelectorAll('.sent-btn')].forEach((b) => { const on = +b.dataset.v === state.sat; b.classList.toggle('is-on', on); b.classList.toggle(b.dataset.v === '1' ? 'yes' : 'no', on); }); },
  'use-receipt': (el) => { const f = $('proofTx'); if (f) { f.value = el.dataset.tx; toast('proof filled'); } },
  'simulate-pay': (el) => { const p = A.proof.pay(+el.dataset.id); toast(`paid · proof ${short(p.txid)}`); render(); },
  'give-feedback': (el) => { const id = +el.dataset.id; if (state.sat == null) return toast('choose satisfied or not', true); const tx = valById('proofTx'); if (!tx) return toast('paste your proof-of-payment hash', true); const r = guard(() => A.rep.giveFeedback({ agentId: id, satisfied: state.sat === 1, paymentTxid: tx })); if (r) { toast('review verified & recorded'); state.sat = null; render(); } },
  'pick-owner': (el) => { state.ownerView = el.value; state.sel = null; render(); },
  'admin-filter': (el) => { state.adminFilter = el.dataset.f; renderAdmin(); },
  'open-event': (el) => openEvent(+el.dataset.i),
  'set-uri': (el) => { const id = +el.dataset.id; guard(() => A.id.setAgentURI(id, valById(`uri-${id}`))); render(); },
  'set-wallet': (el) => { const id = +el.dataset.id; guard(() => A.id.setAgentWallet(id, valById(`wal-${id}`) || A.newAddr(), Date.now() + 3e5, 'sig')); toast('wallet set'); render(); },
  transfer: (el) => { const id = +el.dataset.id; guard(() => A.id.transferFrom(A.state.agents.get(id).owner, valById(`to-${id}`) || A.newAddr(), id)); toast('transferred'); render(); },
  'add-meta': (el) => { const id = +el.dataset.id; guard(() => A.id.setMetadata(id, valById(`mk-${id}`), valById(`mv-${id}`))); render(); },
  respond: (el) => { const id = +el.dataset.id; guard(() => A.rep.appendResponse(id, el.dataset.client, +el.dataset.idx, valById(`ru-${id}-${el.dataset.idx}`) || 'ipfs://resp')); toast('reply posted'); render(); },
  'request-val': (el) => { const id = +el.dataset.id; guard(() => A.val.validationRequest(valById(`vv-${id}`) || A.newAddr(), id, 'ipfs://req', '')); toast('validation requested'); render(); },
  'modal-validate': (el) => { const r = valById('mResp'); const out = guard(() => A.val.validationResponse(el.dataset.h, Number(r), '', '', 'x402:settled')); if (out) { toast(`responded ${r}/100`); closeModal(); render(); } },
  'call-method': (el) => { const mi = +el.dataset.mi, m = METHODS[mi]; const vals = m.f.map((_, j) => { const x = document.querySelector(`.m-in[data-mi="${mi}"][data-j="${j}"]`); return x ? x.value.trim() : ''; }); try { const r = m.call(vals); $(`mout-${mi}`).textContent = JSON.stringify(r, null, 2); $(`mout-${mi}`).classList.remove('err'); } catch (e) { $(`mout-${mi}`).textContent = '✕ ' + e.message; $(`mout-${mi}`).classList.add('err'); } },
};

function render() {
  renderChrome();
  if (state.view === 'marketplace') renderMarketplace();
  else if (state.view === 'manage') renderManage();
  else if (state.view === 'admin') renderAdmin();
  else renderContracts();
}

/* ── ADMIN / observability ──────────────────────────────────────────── */
function renderAdmin() {
  const ag = [...A.state.agents.keys()];
  let reviews = 0, satisfied = 0; ag.forEach((id) => { const t = A.rep.trust(id); reviews += t.total; satisfied += t.satisfied; });
  const vals = [...A.state.validations.entries()];
  const unrated = ag.filter((id) => A.rep.trust(id).score == null).length;
  const overall = reviews ? Math.round((100 * satisfied) / reviews) : 0;
  const f = state.adminFilter || 'all', q = (state.adminQ || '').toLowerCase();
  const evs = A.state.events.filter((e) => (f === 'all' || e.registry === f) && (!q || `${e.registry}.${e.name} ${JSON.stringify(e.args)} ${e.txid}`.toLowerCase().includes(q)));

  $('railLeft').innerHTML = `
    <div class="rail-header"><span>Filter</span><span class="rh-meta">${evs.length}</span></div>
    <div class="pane-pad">
      <input class="rb-input" id="adminQ" placeholder="search transactions…" value="${esc(state.adminQ || '')}" />
      <div class="chip-row">${['all', 'identity', 'reputation', 'validation', 'payment'].map((x) => `<button class="reg-chip ${f === x ? 'is-active' : ''}" data-action="admin-filter" data-f="${x}">${x}</button>`).join('')}</div>
    </div>`;
  $('center').innerHTML = `
    <div class="view-head"><h1 class="big-title">Admin</h1><p class="big-sub">Registry observability — every agent, transaction, and validation.</p></div>
    <div class="kpi-row">
      <div class="kpi"><span class="kpi-n">${ag.length}</span><span class="kpi-l">agents</span></div>
      <div class="kpi"><span class="kpi-n ${scoreClass(reviews ? overall : null)}">${reviews ? overall + '%' : '—'}</span><span class="kpi-l">overall satisfied</span></div>
      <div class="kpi"><span class="kpi-n">${reviews}</span><span class="kpi-l">verified reviews</span></div>
      <div class="kpi"><span class="kpi-n">${vals.length}</span><span class="kpi-l">validations</span></div>
      <div class="kpi"><span class="kpi-n">${unrated}</span><span class="kpi-l">unrated</span></div>
    </div>
    <section class="card"><div class="card-eyebrow">Transactions · ARC-28 <span class="mc-count">${evs.length}</span></div>
      <table class="lm-table"><tr><th>event</th><th>args</th><th>txid</th><th>round</th></tr>
      ${evs.slice(0, 50).map((e) => `<tr class="evt-tr" data-action="open-event" data-i="${A.state.events.indexOf(e)}"><td>${e.registry}.${e.name}</td><td class="evt-args-cell">${esc(JSON.stringify(e.args)).slice(0, 90)}</td><td>${short(e.txid)}</td><td>r${e.round}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-note tight">no transactions</td></tr>'}</table>
    </section>
    <section class="card"><div class="card-eyebrow">Validations queue <span class="mc-count">${vals.length}</span></div>
      ${vals.length ? vals.map(([h, v]) => `<div class="val-row" data-action="open-validation" data-h="${esc(h)}"><span class="vr-resp ${v.response == null ? 'pending' : v.response >= 50 ? 'ok' : 'bad'}">${v.response == null ? 'pending' : v.response + '/100'}</span><span class="vr-validator">agent #${v.agentId} · ${short(v.validator)}</span></div>`).join('') : '<div class="empty-note tight">none</div>'}
    </section>`;
  $('railRight').innerHTML = `
    <div class="rail-right-header"><span class="agency-label">◇ SYSTEM HEALTH</span></div>
    <div class="pane-pad legend">
      <div class="legend-row"><span class="dot score-hi"></span>network · ${A.NET}</div>
      <div class="legend-row">Identity <code ${cp(String(A.APP.identity))}>app ${A.APP.identity}</code></div>
      <div class="legend-row">Reputation <code ${cp(String(A.APP.reputation))}>app ${A.APP.reputation}</code></div>
      <div class="legend-row">Validation <code ${cp(String(A.APP.validation))}>app ${A.APP.validation}</code></div>
      <div class="legend-row">${A.state.events.length} on-chain events</div>
      <div class="legend-row">mode · mock</div>
    </div>`;
}
function openEvent(i) {
  const e = A.state.events[i]; if (!e) return;
  modal(`${e.registry} · ${e.name}`, 'ARC-28 event', kvRows({ ...e.args }) + `<div class="lm-kv"><span>txid</span><code ${cp(e.txid)}>${e.txid}</code></div><div class="lm-kv"><span>round</span><code>r${e.round} · ${A.NET}</code></div>`);
}

function boot() {
  A.seed();
  state.view = document.body.dataset.view || 'marketplace';   // the page selects its surface
  document.addEventListener('click', (e) => {
    const copyEl = e.target.closest('[data-copy]'); if (copyEl) { e.preventDefault(); return copy(copyEl.dataset.copy); }
    const tog = e.target.closest('[data-toggle]'); if (tog) { const t = $(tog.dataset.toggle); if (t) { t.hidden = !t.hidden; tog.classList.toggle('is-open', !t.hidden); } return; }
    if (e.target.id === 'detailModalClose' || e.target.id === 'detailModal') return closeModal();
    if (e.target.id === 'presentToggle') return document.body.classList.toggle('present');
    const act = e.target.closest('[data-action]'); if (act && ACTIONS[act.dataset.action]) ACTIONS[act.dataset.action](act);
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'q') { state.q = e.target.value; const g = document.querySelector('.market-grid'); if (g) g.innerHTML = marketGridHTML(); }
    else if (e.target.id === 'adminQ') { state.adminQ = e.target.value; const q = e.target.value.toLowerCase(); document.querySelectorAll('.evt-tr').forEach((tr) => { tr.style.display = (!q || tr.textContent.toLowerCase().includes(q)) ? '' : 'none'; }); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'sort') { state.sort = e.target.value; render(); }
    else if (e.target.id === 'ownerSel') { state.ownerView = e.target.value; state.sel = null; render(); }
  });
  document.addEventListener('keydown', (e) => { if (e.target.matches('input,textarea,select')) return; if (e.key === 'Escape') closeModal(); else if (e.key === 'p' || e.key === 'P') document.body.classList.toggle('present'); });
  A.subscribe(() => { if (state.view !== 'methods') render(); });
  render();
  renderChainCtx();
  requestAnimationFrame(() => document.body.classList.add('ready'));
}
/* ── Pera wallet → acting caller ────────────────────────────────────── */
let peraActive = false;
function applyPeraCaller() {
  const w = window.WALLET; if (!w) return;
  if (w.account) { peraActive = true; A.setCaller(w.account); toast(`Pera connected · acting as ${short(w.account)}`); }
  else if (peraActive) { peraActive = false; A.setCaller(); toast('Pera disconnected · back to the operator wallet'); }
  else return;                                   // never connected → leave the demo caller alone
  if (document.body.classList.contains('ready')) render();   // pre-boot connects are picked up by boot's first render
}
window.addEventListener('wallet:change', applyPeraCaller);
window.addEventListener('wallet:ready', applyPeraCaller);
window.addEventListener('wallet:error', (e) => toast((e.detail && e.detail.message) || 'Pera wallet error', true));

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
