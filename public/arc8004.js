/*
 * arc8004.js · Front-end client for ARC-8004 (Trustless Agents on Algorand).
 * Identity / Reputation / Validation registries, mock-first, ABI-faithful, with
 * the spec guards. Reputation is *earned + verified*:
 *   · a review REQUIRES a proof-of-payment txid (x402 settlement);
 *   · the proof is verified — it must exist, be for that agent, and the reviewer
 *     must be the payer (a party to the transaction);
 *   · one review per proof (no double submissions);
 *   · trust score = % of verified buyers who were satisfied.
 */
(function (global) {
  "use strict";

  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const genAddr = () => { let s = ""; for (let i = 0; i < 58; i++) s += B32[(Math.random() * 32) | 0]; return s; };
  const genHash = (n = 64) => { const a = "0123456789abcdef"; let s = ""; for (let i = 0; i < n; i++) s += a[(Math.random() * 16) | 0]; return s; };
  const genTxid = () => { let s = ""; for (let i = 0; i < 52; i++) s += B32[(Math.random() * 32) | 0]; return s; };
  const NET = "testnet";   // pinned to TestNet — matches wallet.js + router-server; never switch
  // Genesis-hash prefix per network (CAIP-2).
  const GENESIS = { localnet: "localnet-v1", testnet: "SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe", mainnet: "wGHE2Pwdvd7S12BL5FaOP20EGYesN73k" };
  // Deployed app ids on TestNet (source of truth: public/deployed.testnet.json).
  // Reputation + Validation are initialize()'d to point at Identity (global 'idApp').
  const APP = { identity: 764031067, reputation: 764031363, validation: 764031094 };
  const agentRef = (id) => `algorand:${GENESIS[NET]}:${APP.identity}/${id}`;

  const state = {
    nextId: 1,
    caller: genAddr(),
    agents: new Map(),                 // agentId → { owner, agentURI, metadata:Map, agentWallet, approved, operators:Set }
    feedback: new Map(),               // agentId → Map(client → rows[])  (1-indexed)
    proofs: new Map(),                 // txid → { txid, from(payer), to(agent wallet), agentId, amount, used:bool }
    validations: new Map(),
    agentValidations: new Map(),
    validatorRequests: new Map(),
    events: [],
  };
  const subs = [];
  const subscribe = (cb) => { subs.push(cb); return () => subs.splice(subs.indexOf(cb), 1); };
  function emit(registry, name, args) {
    const e = { ts: Date.now(), registry, name, args, txid: genTxid(), round: 41000000 + state.events.length };
    state.events.unshift(e); subs.forEach((cb) => { try { cb(e); } catch (_) {} });
    return e;
  }
  const must = (cond, msg) => { if (!cond) throw new Error(msg); };
  const getAgent = (id) => { const a = state.agents.get(Number(id)); must(a, `agent ${id} does not exist`); return a; };
  const isAuthorizedOrOwner = (spender, agentId) => {
    const a = state.agents.get(Number(agentId)); if (!a) return false;
    return spender === a.owner || spender === a.approved || a.operators.has(spender);
  };

  /* ── Identity Registry ──────────────────────────────────────────────── */
  const id = {
    register(agentURI = "", metadata = []) {
      const agentId = state.nextId++; const owner = state.caller; const md = new Map();
      for (const [k, v] of metadata || []) { must(k !== "agentWallet", "agentWallet is reserved — set via setAgentWallet"); md.set(k, v); }
      state.agents.set(agentId, { owner, agentURI, metadata: md, agentWallet: owner, approved: null, operators: new Set() });
      emit("identity", "Registered", { agentId, agentURI, owner });
      return { agentId, agentURI, owner, agentRegistry: agentRef(agentId) };
    },
    setAgentURI(agentId, newURI) { const a = getAgent(agentId); must(isAuthorizedOrOwner(state.caller, agentId), "caller is not owner/operator"); a.agentURI = newURI; emit("identity", "URIUpdated", { agentId: Number(agentId), newURI, updatedBy: state.caller }); return { ok: true }; },
    getMetadata(agentId, key) { return { agentId: Number(agentId), key, value: getAgent(agentId).metadata.get(key) ?? null }; },
    setMetadata(agentId, key, value) { const a = getAgent(agentId); must(isAuthorizedOrOwner(state.caller, agentId), "caller is not owner/operator"); must(key !== "agentWallet", "agentWallet is reserved — use setAgentWallet"); a.metadata.set(key, value); emit("identity", "MetadataSet", { agentId: Number(agentId), key, value }); return { ok: true }; },
    setAgentWallet(agentId, newWallet, deadline, _sig) { const a = getAgent(agentId); must(isAuthorizedOrOwner(state.caller, agentId), "caller is not owner/operator"); must(newWallet && newWallet.length === 58, "newWallet must be a 58-char address"); a.agentWallet = newWallet; emit("identity", "AgentWalletSet", { agentId: Number(agentId), newWallet, deadline: Number(deadline) || 0 }); return { ok: true }; },
    getAgentWallet(agentId) { return { agentId: Number(agentId), agentWallet: getAgent(agentId).agentWallet }; },
    unsetAgentWallet(agentId) { const a = getAgent(agentId); must(isAuthorizedOrOwner(state.caller, agentId), "caller is not owner/operator"); a.agentWallet = null; emit("identity", "AgentWalletCleared", { agentId: Number(agentId) }); return { ok: true }; },
    isAuthorizedOrOwner(spender, agentId) { return { spender, agentId: Number(agentId), authorized: isAuthorizedOrOwner(spender, agentId) }; },
    ownerOf(agentId) { return { agentId: Number(agentId), owner: getAgent(agentId).owner }; },
    balanceOf(owner) { let n = 0; for (const a of state.agents.values()) if (a.owner === owner) n++; return { owner, balance: n }; },
    agentsOf(owner) { const out = []; for (const [aid, a] of state.agents) if (a.owner === owner) out.push(aid); return out; },   // fetch an owner's agents
    approve(to, agentId) { const a = getAgent(agentId); must(state.caller === a.owner, "only owner can approve"); a.approved = to; emit("identity", "Approval", { owner: a.owner, approved: to, agentId: Number(agentId) }); return { ok: true }; },
    setApprovalForAll(operator, approved) { for (const a of state.agents.values()) if (a.owner === state.caller) { approved ? a.operators.add(operator) : a.operators.delete(operator); } emit("identity", "ApprovalForAll", { owner: state.caller, operator, approved: !!approved }); return { ok: true }; },
    transferFrom(from, to, agentId) { const a = getAgent(agentId); must(isAuthorizedOrOwner(state.caller, agentId), "caller is not owner/approved"); must(a.owner === from, "from is not the owner"); a.owner = to; a.approved = null; a.agentWallet = null; emit("identity", "arc72_Transfer", { from, to, agentId: Number(agentId) }); return { ok: true }; },
  };

  /* ── Proof-of-payment registry (x402 settlements) ───────────────────── */
  // In production these come from the chain (the x402 facilitator's settle txns).
  // Here we record them so a review can be verified against a real payment.
  const proof = {
    record(agentId, payer, amount = 100000) {
      const a = getAgent(agentId); const txid = genTxid();
      state.proofs.set(txid, { txid, from: payer, to: a.agentWallet || a.owner, agentId: Number(agentId), amount, used: false });
      emit("payment", "x402Settled", { txid, from: payer, to: a.agentWallet || a.owner, agentId: Number(agentId), amount });
      return { txid, agentId: Number(agentId) };
    },
    // simulate the current caller paying for a job (so they can later review)
    pay(agentId, amount = 100000) { return proof.record(agentId, state.caller, amount); },
    get(txid) { return state.proofs.get(txid) || null; },
    // unused receipts a given payer holds for an agent
    receipts(agentId, payer) { return [...state.proofs.values()].filter((p) => p.agentId === Number(agentId) && p.from === payer && !p.used); },
  };

  /* ── Reputation Registry (verified, satisfaction-based) ─────────────── */
  const rep = {
    /**
     * Leave a review. REQUIRES paymentTxid (proof of a paid job) + satisfied.
     * Verifies: proof exists · is for this agent · caller is the payer · not already used.
     */
    giveFeedback({ agentId, satisfied, value, tag1 = "x402", tag2 = "", feedbackURI = "", paymentTxid = "" } = {}) {
      const aid = Number(agentId), client = state.caller;
      getAgent(aid);
      must(!isAuthorizedOrOwner(client, aid), "self-review prohibited (you own this agent)");
      // proof-of-payment verification
      must(paymentTxid, "a proof-of-payment transaction hash is required to review");
      const p = state.proofs.get(paymentTxid);
      must(p, "unknown proof-of-payment — that transaction hash isn't on record");
      must(p.agentId === aid, "that proof-of-payment is for a different agent");
      must(p.from === client, "only a party to that transaction can review — your wallet wasn't the payer");
      must(!p.used, "that proof-of-payment was already used for a review (no double submissions)");
      p.used = true;
      const sat = !!satisfied;
      const val = value != null ? Number(value) : (sat ? 100 : 0);
      if (!state.feedback.has(aid)) state.feedback.set(aid, new Map());
      const byClient = state.feedback.get(aid);
      if (!byClient.has(client)) byClient.set(client, []);
      const rows = byClient.get(client);
      const feedbackIndex = rows.length + 1;
      const feedbackHash = genHash();
      rows.push({ value: val, satisfied: sat, valueDecimals: 0, tag1, tag2, feedbackURI, feedbackHash, paymentTxid, isRevoked: false, responses: [] });
      emit("reputation", "NewFeedback", { agentId: aid, client, feedbackIndex, satisfied: sat, value: val, tag1, paymentTxid, feedbackHash });
      return { agentId: aid, client, feedbackIndex, satisfied: sat, paymentTxid };
    },
    /** Trust score = % of verified buyers satisfied (null when no reviews). */
    trust(agentId) {
      const byClient = state.feedback.get(Number(agentId)) || new Map();
      let total = 0, satisfied = 0;
      for (const rows of byClient.values()) for (const r of rows) { if (r.isRevoked) continue; total++; if (r.satisfied) satisfied++; }
      return { score: total ? Math.round((100 * satisfied) / total) : null, total, satisfied };
    },
    revokeFeedback(agentId, feedbackIndex) { const rows = (state.feedback.get(Number(agentId)) || new Map()).get(state.caller) || []; const row = rows[Number(feedbackIndex) - 1]; must(row, "feedback not found for caller"); row.isRevoked = true; emit("reputation", "FeedbackRevoked", { agentId: Number(agentId), client: state.caller, feedbackIndex: Number(feedbackIndex) }); return { ok: true }; },
    appendResponse(agentId, client, feedbackIndex, responseURI = "", responseHash = "") { const rows = (state.feedback.get(Number(agentId)) || new Map()).get(client) || []; const row = rows[Number(feedbackIndex) - 1]; must(row, "feedback not found"); const hash = responseHash || genHash(); row.responses.push({ responder: state.caller, responseURI, responseHash: hash }); emit("reputation", "ResponseAppended", { agentId: Number(agentId), client, feedbackIndex: Number(feedbackIndex), responder: state.caller, responseHash: hash }); return { ok: true, responseHash: hash }; },
    getSummary(agentId, clients, tag1 = "", tag2 = "") {
      const list = Array.isArray(clients) ? clients : String(clients || "").split(",").map((s) => s.trim()).filter(Boolean);
      must(list.length > 0, "clients[] MUST be non-empty (Sybil guard)");
      const byClient = state.feedback.get(Number(agentId)) || new Map();
      let count = 0, sum = 0, dec = 0;
      for (const c of list) for (const r of (byClient.get(c) || [])) { if (r.isRevoked) continue; if (tag1 && r.tag1 !== tag1) continue; if (tag2 && r.tag2 !== tag2) continue; count++; sum += r.value; dec = r.valueDecimals; }
      return { agentId: Number(agentId), count, summaryValue: sum, summaryValueDecimals: dec };
    },
    readFeedback(agentId, client, feedbackIndex) { const rows = (state.feedback.get(Number(agentId)) || new Map()).get(client) || []; const r = rows[Number(feedbackIndex) - 1]; must(r, "feedback not found"); return { value: r.value, satisfied: r.satisfied, valueDecimals: r.valueDecimals, tag1: r.tag1, tag2: r.tag2, isRevoked: r.isRevoked, paymentTxid: r.paymentTxid }; },
    readAllFeedback(agentId, clients, tag1 = "", tag2 = "", includeRevoked = false) {
      const list = Array.isArray(clients) ? clients : String(clients || "").split(",").map((s) => s.trim()).filter(Boolean);
      const byClient = state.feedback.get(Number(agentId)) || new Map(); const out = [];
      for (const c of list) (byClient.get(c) || []).forEach((r, i) => { if (r.isRevoked && !includeRevoked) return; if (tag1 && r.tag1 !== tag1) return; if (tag2 && r.tag2 !== tag2) return; out.push({ client: c, feedbackIndex: i + 1, value: r.value, satisfied: r.satisfied, tag1: r.tag1, tag2: r.tag2, isRevoked: r.isRevoked, paymentTxid: r.paymentTxid, responses: r.responses.length }); });
      return { agentId: Number(agentId), feedback: out };
    },
    getResponseCount(agentId, client, feedbackIndex) { const rows = (state.feedback.get(Number(agentId)) || new Map()).get(client) || []; const r = rows[Number(feedbackIndex) - 1]; return { count: r ? r.responses.length : 0 }; },
    getClients(agentId) { return { agentId: Number(agentId), clients: [...((state.feedback.get(Number(agentId)) || new Map()).keys())] }; },
    getLastIndex(agentId, client) { return { agentId: Number(agentId), client, lastIndex: ((state.feedback.get(Number(agentId)) || new Map()).get(client) || []).length }; },
  };

  /* ── Validation Registry ────────────────────────────────────────────── */
  const val = {
    validationRequest(validator, agentId, requestURI = "", requestHash = "") { getAgent(agentId); must(isAuthorizedOrOwner(state.caller, agentId), "caller is not owner/operator of agentId"); const h = requestHash || genHash(); must(!state.validations.has(h), "requestHash must be unique"); state.validations.set(h, { validator, agentId: Number(agentId), response: null, responseHash: "", tag: "", lastUpdate: 0, requestURI }); (state.agentValidations.get(Number(agentId)) || state.agentValidations.set(Number(agentId), []).get(Number(agentId))).push(h); (state.validatorRequests.get(validator) || state.validatorRequests.set(validator, []).get(validator)).push(h); emit("validation", "ValidationRequest", { validator, agentId: Number(agentId), requestURI, requestHash: h }); return { requestHash: h, validator, agentId: Number(agentId) }; },
    validationResponse(requestHash, response, responseURI = "", responseHash = "", tag = "") { const rec = state.validations.get(requestHash); must(rec, "unknown requestHash"); must(state.caller === rec.validator, "caller must be the named validator (self-validation prevented)"); const r = Number(response); must(r >= 0 && r <= 100, "response must be in [0,100]"); const a = state.agents.get(rec.agentId); must(!a || a.owner !== state.caller, "validator must not be the agent owner"); rec.response = r; rec.responseHash = responseHash || genHash(); rec.tag = tag; rec.lastUpdate = Date.now(); emit("validation", "ValidationResponse", { validator: rec.validator, agentId: rec.agentId, requestHash, response: r, tag }); return { requestHash, response: r }; },
    getValidationStatus(requestHash) { const r = state.validations.get(requestHash); must(r, "unknown requestHash"); return { validator: r.validator, agentId: r.agentId, response: r.response, responseHash: r.responseHash, tag: r.tag, lastUpdate: r.lastUpdate }; },
    getSummary(agentId, validators, tag = "") { const list = Array.isArray(validators) ? validators : String(validators || "").split(",").map((s) => s.trim()).filter(Boolean); const hs = state.agentValidations.get(Number(agentId)) || []; let count = 0, sum = 0; for (const h of hs) { const r = state.validations.get(h); if (!r || r.response == null) continue; if (list.length && !list.includes(r.validator)) continue; if (tag && r.tag !== tag) continue; count++; sum += r.response; } return { agentId: Number(agentId), count, averageResponse: count ? Math.round(sum / count) : 0 }; },
    getAgentValidations(agentId) { return { agentId: Number(agentId), requests: (state.agentValidations.get(Number(agentId)) || []).slice() }; },
    getValidatorRequests(validator) { return { validator, requests: (state.validatorRequests.get(validator) || []).slice() }; },
  };

  /* ── seed: agents with verified, payment-anchored reviews ───────────── */
  function seed() {
    const keep = state.caller;
    const mk = (uri, name, reg, sentiments) => {
      state.caller = genAddr();
      const { agentId } = id.register(uri, [["name", name], ["register", reg]]);
      sentiments.forEach((satisfied) => { const client = genAddr(); const { txid } = proof.record(agentId, client); state.caller = client; rep.giveFeedback({ agentId, satisfied, paymentTxid: txid }); });
      return agentId;
    };
    mk("ipfs://helios-card", "Helios Diligence", "Diligence", [true, true, true, true, false]);   // 80%
    mk("ipfs://vega-card", "Vega Quotes", "Diligence", [true, false, false]);                      // 33%
    mk("ipfs://comet-card", "Comet Outreach", "Outreach", [true, true, false]);                    // 67%
    mk("ipfs://arbiter-card", "Arbiter Prime", "Judgment", [true, true, true, true]);              // 100%
    state.caller = keep;
  }

  global.ARC8004 = {
    id, rep, val, proof,
    state, subscribe,
    get caller() { return state.caller; },
    setCaller(addr) { state.caller = addr || genAddr(); return state.caller; },
    newAddr: genAddr, newHash: genHash, newTxid: genTxid, agentRef, APP, NET, GENESIS, seed,
  };
})(typeof window !== "undefined" ? window : globalThis);
