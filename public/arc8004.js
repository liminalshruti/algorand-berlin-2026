/*
 * arc8004.js · Front-end client for the ARC-8004 (Trustless Agents on Algorand) method surface.
 * ════════════════════════════════════════════════════════════════════════
 * One front-end function per ABI method across the three registries
 * (Identity / Reputation / Validation), per ref/ARC-8004.md + ERC8004_AVM_MAPPING.
 * Mock-first: faithful in-memory store enforcing the spec's guards
 * (self-feedback / self-validation prevention, reserved agentWallet, getSummary
 * non-empty clients, response 0..100, agent-must-exist, etc.) and emitting
 * ARC-28-shaped events. Swap to live by pointing each method at its app-call /
 * HTTP endpoint later — signatures already match the ABI.
 *
 * Usage:  ARC8004.id.register(uri, meta)  ·  ARC8004.rep.giveFeedback({...})
 *         ARC8004.val.validationResponse({...})  ·  ARC8004.subscribe(cb)
 *         ARC8004.setCaller(addr)  ·  ARC8004.state
 */
(function (global) {
  "use strict";

  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const genAddr = () => { let s = ""; for (let i = 0; i < 58; i++) s += B32[(Math.random() * 32) | 0]; return s; };
  const genHash = (n = 64) => { const a = "0123456789abcdef"; let s = ""; for (let i = 0; i < n; i++) s += a[(Math.random() * 16) | 0]; return s; };
  const NET = "localnet";
  const APP = { identity: 1001, reputation: 1002, validation: 1003 };
  const agentRef = (id) => `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k:${APP.identity}/${id}`;

  /* ── in-memory ledger state ─────────────────────────────────────────── */
  const state = {
    nextId: 1,
    caller: genAddr(),                 // the acting wallet (settable to demo guards)
    agents: new Map(),                 // agentId → { owner, agentURI, metadata:Map, agentWallet, approved, operators:Set }
    feedback: new Map(),               // agentId → Map(client → rows[])  (1-indexed)
    validations: new Map(),            // requestHash → record
    agentValidations: new Map(),       // agentId → [requestHash]
    validatorRequests: new Map(),      // validator → [requestHash]
    events: [],
  };
  const subs = [];
  const subscribe = (cb) => { subs.push(cb); return () => subs.splice(subs.indexOf(cb), 1); };
  function emit(registry, name, args) {
    const e = { ts: Date.now(), registry, name, args, txid: genHash(52).toUpperCase().slice(0, 52), round: 41000000 + state.events.length };
    state.events.unshift(e); subs.forEach((cb) => { try { cb(e); } catch (_) {} });
    return e;
  }
  const must = (cond, msg) => { if (!cond) throw new Error(msg); };
  const getAgent = (id) => { const a = state.agents.get(Number(id)); must(a, `agent ${id} does not exist`); return a; };
  const isAuthorizedOrOwner = (spender, agentId) => {
    const a = state.agents.get(Number(agentId)); if (!a) return false;
    return spender === a.owner || spender === a.approved || a.operators.has(spender);
  };

  /* ── Identity Registry (ARC-72 + metadata + agentWallet) ────────────── */
  const id = {
    register(agentURI = "", metadata = []) {
      const agentId = state.nextId++;
      const owner = state.caller;
      const md = new Map();
      for (const [k, v] of metadata || []) { must(k !== "agentWallet", "agentWallet is reserved — set via setAgentWallet"); md.set(k, v); }
      state.agents.set(agentId, { owner, agentURI, metadata: md, agentWallet: owner, approved: null, operators: new Set() });
      emit("identity", "Registered", { agentId, agentURI, owner });
      return { agentId, agentURI, owner, agentRegistry: agentRef(agentId) };
    },
    setAgentURI(agentId, newURI) {
      const a = getAgent(agentId); must(isAuthorizedOrOwner(state.caller, agentId), "caller is not owner/operator");
      a.agentURI = newURI; emit("identity", "URIUpdated", { agentId: Number(agentId), newURI, updatedBy: state.caller }); return { ok: true };
    },
    getMetadata(agentId, key) { return { agentId: Number(agentId), key, value: getAgent(agentId).metadata.get(key) ?? null }; },
    setMetadata(agentId, key, value) {
      const a = getAgent(agentId); must(isAuthorizedOrOwner(state.caller, agentId), "caller is not owner/operator");
      must(key !== "agentWallet", "agentWallet is reserved — use setAgentWallet");
      a.metadata.set(key, value); emit("identity", "MetadataSet", { agentId: Number(agentId), key, value }); return { ok: true };
    },
    setAgentWallet(agentId, newWallet, deadline, _signature) {
      const a = getAgent(agentId); must(isAuthorizedOrOwner(state.caller, agentId), "caller is not owner/operator");
      must(newWallet && newWallet.length === 58, "newWallet must be a 58-char Algorand address");
      a.agentWallet = newWallet; emit("identity", "AgentWalletSet", { agentId: Number(agentId), newWallet, deadline: Number(deadline) || 0 }); return { ok: true };
    },
    getAgentWallet(agentId) { return { agentId: Number(agentId), agentWallet: getAgent(agentId).agentWallet }; },
    unsetAgentWallet(agentId) { const a = getAgent(agentId); must(isAuthorizedOrOwner(state.caller, agentId), "caller is not owner/operator"); a.agentWallet = null; emit("identity", "AgentWalletCleared", { agentId: Number(agentId) }); return { ok: true }; },
    isAuthorizedOrOwner(spender, agentId) { return { spender, agentId: Number(agentId), authorized: isAuthorizedOrOwner(spender, agentId) }; },
    ownerOf(agentId) { return { agentId: Number(agentId), owner: getAgent(agentId).owner }; },
    balanceOf(owner) { let n = 0; for (const a of state.agents.values()) if (a.owner === owner) n++; return { owner, balance: n }; },
    approve(to, agentId) { const a = getAgent(agentId); must(state.caller === a.owner, "only owner can approve"); a.approved = to; emit("identity", "Approval", { owner: a.owner, approved: to, agentId: Number(agentId) }); return { ok: true }; },
    setApprovalForAll(operator, approved) { for (const a of state.agents.values()) if (a.owner === state.caller) { approved ? a.operators.add(operator) : a.operators.delete(operator); } emit("identity", "ApprovalForAll", { owner: state.caller, operator, approved: !!approved }); return { ok: true }; },
    transferFrom(from, to, agentId) {
      const a = getAgent(agentId); must(isAuthorizedOrOwner(state.caller, agentId), "caller is not owner/approved"); must(a.owner === from, "from is not the owner");
      a.owner = to; a.approved = null; a.agentWallet = null;   // hook: clear agentWallet on transfer
      emit("identity", "arc72_Transfer", { from, to, agentId: Number(agentId) }); return { ok: true };
    },
  };

  /* ── Reputation Registry ────────────────────────────────────────────── */
  const rep = {
    giveFeedback({ agentId, value, valueDecimals = 0, tag1 = "", tag2 = "", endpoint = "", feedbackURI = "", feedbackHash = "", paymentTxid = "", nonce } = {}) {
      getAgent(agentId);
      must(!isAuthorizedOrOwner(state.caller, agentId), "self-feedback prohibited (caller is owner/operator)");
      must(valueDecimals >= 0 && valueDecimals <= 18, "valueDecimals must be in [0,18]");
      must(Math.abs(Number(value)) <= 1e38, "|value| must be <= 1e38");
      must(paymentTxid && nonce != null && nonce !== "", "x402 paymentTxid + nonce are mandatory (giveFeedback profile)");
      const aid = Number(agentId), client = state.caller;
      if (!state.feedback.has(aid)) state.feedback.set(aid, new Map());
      const byClient = state.feedback.get(aid);
      if (!byClient.has(client)) byClient.set(client, []);
      const rows = byClient.get(client);
      const feedbackIndex = rows.length + 1;             // 1-indexed
      const hash = feedbackHash || genHash();
      rows.push({ value: Number(value), valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash: hash, paymentTxid, nonce, isRevoked: false, responses: [] });
      emit("reputation", "NewFeedback", { agentId: aid, client, feedbackIndex, value: Number(value), valueDecimals, tag1, tag2, feedbackHash: hash, paymentTxid, nonce });
      return { agentId: aid, client, feedbackIndex, feedbackHash: hash };
    },
    revokeFeedback(agentId, feedbackIndex) {
      const rows = (state.feedback.get(Number(agentId)) || new Map()).get(state.caller) || [];
      const row = rows[Number(feedbackIndex) - 1]; must(row, "feedback not found for caller");
      row.isRevoked = true; emit("reputation", "FeedbackRevoked", { agentId: Number(agentId), client: state.caller, feedbackIndex: Number(feedbackIndex) }); return { ok: true };
    },
    appendResponse(agentId, client, feedbackIndex, responseURI = "", responseHash = "") {
      const rows = (state.feedback.get(Number(agentId)) || new Map()).get(client) || [];
      const row = rows[Number(feedbackIndex) - 1]; must(row, "feedback not found");
      const hash = responseHash || genHash(); row.responses.push({ responder: state.caller, responseURI, responseHash: hash });
      emit("reputation", "ResponseAppended", { agentId: Number(agentId), client, feedbackIndex: Number(feedbackIndex), responder: state.caller, responseHash: hash });
      return { ok: true, responseHash: hash };
    },
    getSummary(agentId, clients, tag1 = "", tag2 = "") {
      const list = Array.isArray(clients) ? clients : String(clients || "").split(",").map((s) => s.trim()).filter(Boolean);
      must(list.length > 0, "clients[] MUST be non-empty (Sybil guard)");
      const byClient = state.feedback.get(Number(agentId)) || new Map();
      let count = 0, sum = 0, dec = 0;
      for (const c of list) for (const r of (byClient.get(c) || [])) {
        if (r.isRevoked) continue; if (tag1 && r.tag1 !== tag1) continue; if (tag2 && r.tag2 !== tag2) continue;
        count++; sum += r.value; dec = r.valueDecimals;
      }
      return { agentId: Number(agentId), count, summaryValue: sum, summaryValueDecimals: dec };
    },
    readFeedback(agentId, client, feedbackIndex) {
      const rows = (state.feedback.get(Number(agentId)) || new Map()).get(client) || [];
      const r = rows[Number(feedbackIndex) - 1]; must(r, "feedback not found");
      return { value: r.value, valueDecimals: r.valueDecimals, tag1: r.tag1, tag2: r.tag2, isRevoked: r.isRevoked };
    },
    readAllFeedback(agentId, clients, tag1 = "", tag2 = "", includeRevoked = false) {
      const list = Array.isArray(clients) ? clients : String(clients || "").split(",").map((s) => s.trim()).filter(Boolean);
      const byClient = state.feedback.get(Number(agentId)) || new Map(); const out = [];
      for (const c of list) (byClient.get(c) || []).forEach((r, i) => {
        if (r.isRevoked && !includeRevoked) return; if (tag1 && r.tag1 !== tag1) return; if (tag2 && r.tag2 !== tag2) return;
        out.push({ client: c, feedbackIndex: i + 1, value: r.value, valueDecimals: r.valueDecimals, tag1: r.tag1, tag2: r.tag2, isRevoked: r.isRevoked });
      });
      return { agentId: Number(agentId), feedback: out };
    },
    getResponseCount(agentId, client, feedbackIndex) {
      const rows = (state.feedback.get(Number(agentId)) || new Map()).get(client) || [];
      const r = rows[Number(feedbackIndex) - 1]; return { count: r ? r.responses.length : 0 };
    },
    getClients(agentId) { return { agentId: Number(agentId), clients: [...((state.feedback.get(Number(agentId)) || new Map()).keys())] }; },
    getLastIndex(agentId, client) { return { agentId: Number(agentId), client, lastIndex: ((state.feedback.get(Number(agentId)) || new Map()).get(client) || []).length }; },
  };

  /* ── Validation Registry ────────────────────────────────────────────── */
  const val = {
    validationRequest(validator, agentId, requestURI = "", requestHash = "") {
      getAgent(agentId); must(isAuthorizedOrOwner(state.caller, agentId), "caller is not owner/operator of agentId");
      const h = requestHash || genHash(); must(!state.validations.has(h), "requestHash must be unique");
      state.validations.set(h, { validator, agentId: Number(agentId), response: null, responseHash: "", tag: "", lastUpdate: 0, requestURI });
      (state.agentValidations.get(Number(agentId)) || state.agentValidations.set(Number(agentId), []).get(Number(agentId))).push(h);
      (state.validatorRequests.get(validator) || state.validatorRequests.set(validator, []).get(validator)).push(h);
      emit("validation", "ValidationRequest", { validator, agentId: Number(agentId), requestURI, requestHash: h });
      return { requestHash: h, validator, agentId: Number(agentId) };
    },
    validationResponse(requestHash, response, responseURI = "", responseHash = "", tag = "") {
      const rec = state.validations.get(requestHash); must(rec, "unknown requestHash");
      must(state.caller === rec.validator, "caller must be the named validator (self-validation prevented)");
      const r = Number(response); must(r >= 0 && r <= 100, "response must be in [0,100]");
      const a = state.agents.get(rec.agentId); must(!a || a.owner !== state.caller, "validator must not be the agent owner");
      rec.response = r; rec.responseHash = responseHash || genHash(); rec.tag = tag; rec.lastUpdate = Date.now();
      emit("validation", "ValidationResponse", { validator: rec.validator, agentId: rec.agentId, requestHash, response: r, tag });
      return { requestHash, response: r };
    },
    getValidationStatus(requestHash) {
      const r = state.validations.get(requestHash); must(r, "unknown requestHash");
      return { validator: r.validator, agentId: r.agentId, response: r.response, responseHash: r.responseHash, tag: r.tag, lastUpdate: r.lastUpdate };
    },
    getSummary(agentId, validators, tag = "") {
      const list = Array.isArray(validators) ? validators : String(validators || "").split(",").map((s) => s.trim()).filter(Boolean);
      const hs = state.agentValidations.get(Number(agentId)) || []; let count = 0, sum = 0;
      for (const h of hs) { const r = state.validations.get(h); if (!r || r.response == null) continue; if (list.length && !list.includes(r.validator)) continue; if (tag && r.tag !== tag) continue; count++; sum += r.response; }
      return { agentId: Number(agentId), count, averageResponse: count ? Math.round(sum / count) : 0 };
    },
    getAgentValidations(agentId) { return { agentId: Number(agentId), requests: (state.agentValidations.get(Number(agentId)) || []).slice() }; },
    getValidatorRequests(validator) { return { validator, requests: (state.validatorRequests.get(validator) || []).slice() }; },
  };

  /* ── seed a couple of agents so the console isn't empty ─────────────── */
  function seed() {
    const keep = state.caller;
    state.caller = genAddr(); id.register("ipfs://helios-card", [["name", "Helios Diligence"], ["register", "Diligence"]]);
    state.caller = genAddr(); id.register("ipfs://vega-card", [["name", "Vega Quotes"], ["register", "Diligence"]]);
    state.caller = keep;
  }

  global.ARC8004 = {
    id, rep, val,
    state, subscribe,
    get caller() { return state.caller; },
    setCaller(addr) { state.caller = addr || genAddr(); return state.caller; },
    newAddr: genAddr, newHash: genHash, agentRef, APP, NET, seed,
  };
})(typeof window !== "undefined" ? window : globalThis);
