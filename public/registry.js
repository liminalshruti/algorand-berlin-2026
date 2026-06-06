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
const regClass = (r) => `reg-${String(r || 'default').toLowerCase()}`;
const scoreClass = (s) => (s == null ? 'score-na' : s >= 75 ? 'score-hi' : s >= 50 ? 'score-mid' : 'score-lo');

const state = { view: 'marketplace', sel: null, q: '', reg: 'all', sort: 'rep' };
let toastTimer = null;
function toast(msg, bad) { const t = $('toast'), m = $('toast-msg'); m.textContent = msg; t.classList.toggle('is-bad', !!bad); t.classList.add('is-shown'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('is-shown'), 3200); }
function copy(text) { try { navigator.clipboard.writeText(text); toast('copied'); } catch (_) { toast('copy failed', true); } }
function guard(fn) { try { return fn(); } catch (e) { toast(e.message, true); return null; } }

/* ── data helpers ───────────────────────────────────────────────────── */
const nameOf = (id) => (A.state.agents.get(id)?.metadata.get('name')) || `agent #${id}`;
const regOf = (id) => (A.state.agents.get(id)?.metadata.get('register')) || '—';
function repOf(id) {
  const clients = A.rep.getClients(id).clients;
  const summary = clients.length ? A.rep.getSummary(id, clients) : { count: 0, summaryValue: 0 };
  const valAvg = A.val.getSummary(id, []).averageResponse;
  const score = summary.count ? summary.summaryValue : null;
  return { clients, count: summary.count, score, valAvg };
}
const allAgents = () => [...A.state.agents.keys()];
const registers = () => ['all', ...new Set(allAgents().map(regOf).filter((r) => r && r !== '—'))];

/* ── chrome ─────────────────────────────────────────────────────────── */
function renderChrome() {
  document.body.dataset.view = state.view;
  [...document.querySelectorAll('.console-tab')].forEach((t) => t.classList.toggle('is-active', t.dataset.view === state.view));
  const role = state.view === 'manage' ? 'managing as' : state.view === 'methods' ? 'caller' : 'browsing as';
  $('roleHint').textContent = state.view === 'manage' ? 'owner' : state.view === 'methods' ? 'developer' : 'client';
  $('identityChip').innerHTML = `<span class="idc-role">${role}</span> <code ${cp(A.caller)}>${short(A.caller)}</code> <button class="idc-switch" data-action="new-identity" title="act as a different wallet">switch ↺</button>`;
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
      <div class="view-head"><h1 class="big-title">Marketplace</h1><p class="big-sub">Pick an agent by <em>earned</em> trust — every score is built from paid, validated reviews.</p></div>
      <div class="market-grid">${marketGridHTML()}</div>`;
  }

  // right — how trust works + recent activity
  $('railRight').innerHTML = `
    <div class="rail-right-header"><span class="agency-label">◇ HOW TRUST WORKS</span></div>
    <div class="pane-pad legend">
      <p>Reputation = <em>(reads − corrections) / reads</em>, from reviews each tied to an x402 payment.</p>
      <div class="legend-row"><span class="dot score-hi"></span>75–100 trusted</div>
      <div class="legend-row"><span class="dot score-mid"></span>50–74 mixed</div>
      <div class="legend-row"><span class="dot score-lo"></span>0–49 caught / weak</div>
      <div class="legend-row"><span class="dot score-na"></span>unrated · no history</div>
    </div>
    <div class="rail-subhead">Recent activity</div>
    <div class="mini-log">${A.state.events.slice(0, 6).map((e) => `<div class="mini-evt"><span class="${regClass('')} me-name">${e.registry}.${e.name}</span></div>`).join('') || '<div class="empty-note">—</div>'}</div>`;
}

function marketCard(r) {
  return `<button class="agent-card ${regClass(r.reg)}" data-action="open-agent" data-id="${r.id}">
    <div class="ac-top"><span class="reg-badge ${regClass(r.reg)}">${esc(r.reg)}</span>${r.count ? `<span class="ac-verified">✓ ${r.count} paid</span>` : '<span class="ac-new">new</span>'}</div>
    <div class="ac-name">${esc(r.name)}</div>
    <div class="ac-scorewrap"><span class="ac-score ${scoreClass(r.score)}">${r.score ?? '—'}</span><span class="ac-scorelbl">trust${r.valAvg ? ` · ${r.valAvg} val` : ''}</span></div>
    <div class="ac-bar"><i class="${scoreClass(r.score)}" style="width:${r.score ?? 0}%"></i></div>
  </button>`;
}

function renderClientDetail(id) {
  const a = A.state.agents.get(id); if (!a) { state.sel = null; return renderMarketplace(); }
  const { clients, count, score, valAvg } = repOf(id);
  const fb = A.rep.readAllFeedback(id, clients, '', '', false).feedback;
  const reg = regOf(id);
  const isOwner = a.owner === A.caller;
  $('center').innerHTML = `
    <button class="back-link" data-action="back">← Marketplace</button>
    <div class="detail-hero ${regClass(reg)}">
      <span class="reg-badge ${regClass(reg)}">${esc(reg)}</span>
      <h1 class="big-title">${esc(nameOf(id))}</h1>
      <div class="hero-score"><span class="ac-score ${scoreClass(score)}">${score ?? '—'}</span><span class="ac-scorelbl">trust score · ${count} paid reviews${valAvg ? ` · ${valAvg}/100 validation` : ''}</span>
        <button class="link-btn" data-action="open-score" data-id="${id}">see the transactions ▸</button></div>
    </div>

    <section class="card soft">
      <div class="card-eyebrow">Identity</div>
      <div class="kv"><span>address</span><code ${cp(a.owner)}>${short(a.owner)}</code></div>
      <div class="kv"><span>agentURI</span><code>${esc(a.agentURI) || '—'}</code></div>
      <div class="kv"><span>registry</span><code ${cp(A.agentRef(id))}>${short(A.agentRef(id))}</code></div>
    </section>

    <section class="card soft">
      <div class="card-eyebrow">Recent reviews</div>
      <div class="fb-list">${fb.slice(0, 6).map((r) => `<div class="fb-row"><span class="fb-val">${r.value}</span><span class="fb-tags">${esc(r.tag1) || '—'}</span><span class="fb-client">${short(r.client)}</span></div>`).join('') || '<div class="empty-note">No reviews yet.</div>'}</div>
    </section>

    <section class="card accent">
      <div class="card-eyebrow">Your review</div>
      ${isOwner
        ? `<p class="empty-note">You own this agent — you can't review your own (self-feedback is blocked on-chain).</p>`
        : `<button class="disc-btn primary" data-toggle="rateForm">★ Rate this agent</button>
           <div id="rateForm" class="disc-panel" hidden>
             <p class="hint">Reviews are payment-anchored (x402) — only meaningful from a buyer who paid.</p>
             <div class="form-row"><input class="rb-input" id="rateVal" type="number" min="0" max="100" placeholder="score 0–100" /><input class="rb-input" id="rateTag" placeholder="tag (e.g. x402)" /></div>
             <button class="mini-btn primary" data-action="give-feedback" data-id="${id}">Submit review</button>
           </div>`}
    </section>`;
}

/* ── MANAGE (owner) ─────────────────────────────────────────────────── */
function renderManage() {
  const owned = allAgents().filter((id) => A.state.agents.get(id).owner === A.caller);
  $('railLeft').innerHTML = `
    <div class="rail-header"><span>Your agents</span><span class="rh-meta">${owned.length}</span></div>
    <div class="pane-pad">
      <button class="disc-btn primary block" data-toggle="registerForm">＋ Register an agent</button>
      <div id="registerForm" class="disc-panel" hidden>
        <input class="rb-input" id="regName" placeholder="agent name" />
        <input class="rb-input" id="regURI" placeholder="agentURI (ipfs:// · https://)" />
        <select class="rb-select" id="regRegister">${['Diligence', 'Outreach', 'Judgment', 'Operations'].map((r) => `<option>${r}</option>`).join('')}</select>
        <button class="mini-btn primary" data-action="register">Register</button>
      </div>
    </div>
    <div class="rail-subhead">Owned by you</div>
    <div class="owned-list">${owned.map((id) => `<button class="owned-link ${regClass(regOf(id))}" data-action="focus-agent" data-id="${id}">${esc(nameOf(id))} <span class="ol-id">#${id}</span></button>`).join('') || '<div class="empty-note">None yet — register one above, or pick an agent to manage on the right.</div>'}</div>`;

  // center — management cards (owned first; others manageable via act-as)
  const focus = state.sel != null && A.state.agents.has(state.sel) ? [state.sel] : owned;
  const list = focus.length ? focus : allAgents().slice(0, 1);
  $('center').innerHTML = `
    <div class="view-head"><h1 class="big-title">Manage</h1><p class="big-sub">Run your agents — identity, metadata, and the reviews you've received.</p></div>
    ${list.map(manageCard).join('') || '<div class="empty-note">No agents. Register one on the left.</div>'}`;

  // right — owner stats
  const recvd = owned.reduce((n, id) => n + repOf(id).count, 0);
  $('railRight').innerHTML = `
    <div class="rail-right-header"><span class="agency-label">◇ YOUR STANDING</span></div>
    <div class="pane-pad stat-block">
      <div class="stat"><span class="stat-n">${owned.length}</span><span class="stat-l">agents owned</span></div>
      <div class="stat"><span class="stat-n">${recvd}</span><span class="stat-l">reviews received</span></div>
    </div>
    <div class="rail-subhead">Other agents</div>
    <div class="owned-list">${allAgents().filter((id) => !owned.includes(id)).map((id) => `<button class="owned-link ${regClass(regOf(id))}" data-action="act-owner" data-id="${id}">${esc(nameOf(id))} <span class="ol-id">act as owner ↺</span></button>`).join('') || '<div class="empty-note">—</div>'}</div>`;
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
    ${!isOwner ? `<div class="owner-gate">You don't own this agent. <button class="mini-btn" data-action="act-owner" data-id="${id}">Act as owner to edit</button></div>` : ''}

    <div class="mc-section">
      <div class="mc-row"><span class="mc-k">owner</span><code ${cp(a.owner)}>${short(a.owner)}</code></div>
      <div class="mc-row"><span class="mc-k">wallet</span><code ${a.agentWallet ? cp(a.agentWallet) : ''}>${a.agentWallet ? short(a.agentWallet) : '— cleared'}</code></div>
      <div class="mc-row"><span class="mc-k">agentURI</span><code>${esc(a.agentURI) || '—'}</code></div>
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
        <span class="fb-val">${r.value}</span><span class="fb-tags">${esc(r.tag1) || '—'}</span><span class="fb-client">${short(r.client)} #${r.feedbackIndex}</span>
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
function renderMethods() {
  $('railLeft').innerHTML = `<div class="rail-header"><span>Advanced</span></div><div class="pane-pad legend"><p>Raw ARC-8004 ABI — every method with the spec guards. Calls run as <code ${cp(A.caller)}>${short(A.caller)}</code>.</p></div>`;
  $('railRight').innerHTML = '';
  $('center').innerHTML = `<div class="view-head"><h1 class="big-title">Methods</h1><p class="big-sub">Full Identity · Reputation · Validation surface.</p></div>` +
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
  const { clients } = repOf(id);
  const fb = A.rep.readAllFeedback(id, clients, '', '', true).feedback;
  const txns = fb.map((r) => { const row = A.state.feedback.get(id).get(r.client)[r.feedbackIndex - 1]; return { client: short(r.client), value: r.value, tag: r.tag1, paymentTxid: short(row.paymentTxid), nonce: row.nonce, revoked: r.isRevoked }; });
  modal('Reputation provenance', `Transactions behind ${nameOf(id)}`, `
    <p class="lm-mean">Every review is anchored to an x402 payment (paymentTxid + nonce). Earned, not self-reported.</p>
    ${txns.length ? `<table class="lm-table"><tr><th>client</th><th>value</th><th>tag</th><th>paymentTxid</th><th>nonce</th></tr>${txns.map((t) => `<tr class="${t.revoked ? 'is-rev' : ''}"><td>${t.client}</td><td>${t.value}</td><td>${esc(t.tag)}</td><td>${t.paymentTxid}</td><td>${t.nonce}</td></tr>`).join('')}</table>` : '<p class="empty-note">no reviews yet</p>'}`);
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
  'new-identity': () => { A.setCaller(A.newAddr()); toast('acting as a new wallet'); render(); },
  search: () => {}, // handled by input listener
  'filter-reg': (el) => { state.reg = el.dataset.reg; render(); },
  'open-agent': (el) => { state.sel = +el.dataset.id; render(); },
  back: () => { state.sel = null; render(); },
  'focus-agent': (el) => focusAgent(+el.dataset.id),
  'act-owner': (el) => { const id = +el.dataset.id; A.setCaller(A.state.agents.get(id).owner); state.sel = id; toast(`acting as owner of #${id}`); render(); },
  'open-score': (el) => openScore(+el.dataset.id),
  'open-validation': (el) => openValidation(el.dataset.h),
  register: () => { const name = valById('regName') || `Agent ${A.state.nextId}`; A.setCaller(A.newAddr()); const r = A.id.register(valById('regURI') || 'ipfs://card', [['name', name], ['register', $('regRegister').value]]); toast(`registered #${r.agentId}`); state.sel = r.agentId; render(); },
  'give-feedback': (el) => { const id = +el.dataset.id; const v = valById('rateVal'); if (v === '') return toast('enter a score', true); const r = guard(() => A.rep.giveFeedback({ agentId: id, value: Number(v), tag1: valById('rateTag') || 'x402', paymentTxid: A.newHash(), nonce: (Math.random() * 1e6) | 0 })); if (r) { toast('review submitted'); render(); } },
  'set-uri': (el) => { const id = +el.dataset.id; guard(() => A.id.setAgentURI(id, valById(`uri-${id}`))); render(); },
  'set-wallet': (el) => { const id = +el.dataset.id; guard(() => A.id.setAgentWallet(id, valById(`wal-${id}`) || A.newAddr(), Date.now() + 3e5, 'sig')); toast('wallet set'); render(); },
  transfer: (el) => { const id = +el.dataset.id; guard(() => A.id.transferFrom(A.state.agents.get(id).owner, valById(`to-${id}`) || A.newAddr(), id)); toast('transferred'); render(); },
  'add-meta': (el) => { const id = +el.dataset.id; guard(() => A.id.setMetadata(id, valById(`mk-${id}`), valById(`mv-${id}`))); render(); },
  respond: (el) => { const id = +el.dataset.id; guard(() => A.rep.appendResponse(id, el.dataset.client, +el.dataset.idx, valById(`ru-${id}-${el.dataset.idx}`) || 'ipfs://resp')); toast('reply posted'); render(); },
  'request-val': (el) => { const id = +el.dataset.id; guard(() => A.val.validationRequest(valById(`vv-${id}`) || A.newAddr(), id, 'ipfs://req', '')); toast('validation requested'); render(); },
  'modal-validate': (el) => { const r = valById('mResp'); const out = guard(() => A.val.validationResponse(el.dataset.h, Number(r), '', '', 'x402:settled')); if (out) { toast(`responded ${r}/100`); closeModal(); render(); } },
  'call-method': (el) => { const mi = +el.dataset.mi, m = METHODS[mi]; const vals = m.f.map((_, j) => { const x = document.querySelector(`.m-in[data-mi="${mi}"][data-j="${j}"]`); return x ? x.value.trim() : ''; }); try { const r = m.call(vals); $(`mout-${mi}`).textContent = JSON.stringify(r, null, 2); $(`mout-${mi}`).classList.remove('err'); } catch (e) { $(`mout-${mi}`).textContent = '✕ ' + e.message; $(`mout-${mi}`).classList.add('err'); } },
};

function render() { renderChrome(); if (state.view === 'marketplace') renderMarketplace(); else if (state.view === 'manage') renderManage(); else renderMethods(); }

function boot() {
  A.seed();
  document.addEventListener('click', (e) => {
    const copyEl = e.target.closest('[data-copy]'); if (copyEl) { e.preventDefault(); return copy(copyEl.dataset.copy); }
    const tog = e.target.closest('[data-toggle]'); if (tog) { const t = $(tog.dataset.toggle); if (t) { t.hidden = !t.hidden; tog.classList.toggle('is-open', !t.hidden); } return; }
    if (e.target.id === 'detailModalClose' || e.target.id === 'detailModal') return closeModal();
    if (e.target.id === 'presentToggle') return document.body.classList.toggle('present');
    const act = e.target.closest('[data-action]'); if (act && ACTIONS[act.dataset.action]) ACTIONS[act.dataset.action](act);
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'q') { state.q = e.target.value; const g = document.querySelector('.market-grid'); if (g) g.innerHTML = marketGridHTML(); } });
  document.addEventListener('change', (e) => { if (e.target.id === 'sort') { state.sort = e.target.value; render(); } });
  document.addEventListener('keydown', (e) => { if (e.target.matches('input,textarea,select')) return; if (e.key === 'Escape') closeModal(); else if (e.key === 'p' || e.key === 'P') document.body.classList.toggle('present'); });
  A.subscribe(() => { if (state.view !== 'methods') render(); });
  render();
  requestAnimationFrame(() => document.body.classList.add('ready'));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
