/*
 * wallet.js · Shared Pera Wallet client for the Liminal frontend (router + registry).
 * ════════════════════════════════════════════════════════════════════════
 * No build step: pulls @perawallet/connect + algosdk from an ESM CDN at runtime
 * (dynamic import, so a CDN miss degrades the button instead of breaking the page).
 *
 * One connection shared across both pages:
 *   · Pera's own WalletConnect session persists (reconnect() resumes it).
 *   · The active address is mirrored to localStorage so the other tab/page shows it instantly.
 *
 * Reacting from the classic page scripts (registry.js / router.js):
 *   window.addEventListener("wallet:change", …)   // connect / disconnect / reconnect
 *   window.addEventListener("wallet:ready", …)     // module booted, deps may still be loading
 *   window.addEventListener("wallet:error", e => e.detail.message)
 *   window.WALLET.account / .isConnected / .network / .connect() / .disconnect()
 *
 * Signing is real: signAndSend()/payment() sign with Pera and submit to TestNet
 * (Pera can't reach localnet). explorerFor() returns a lora TestNet link.
 *
 * Any element with [data-pera-connect] becomes a connect/disconnect toggle, auto-labelled.
 */
const NETWORK = "testnet";
const CHAIN_ID = 416002;                              // Algorand TestNet (mainnet = 416001)
const ALGOD = "https://testnet-api.algonode.cloud";
const LS_KEY = "liminal.pera.account";
const PERA_CDN = "https://esm.sh/@perawallet/connect@1.5.2";   // needs the js-sha3 import-map shim (see HTML head)
// Match the algosdk major Pera bundles (v3) and the exact import specifier it uses, so the
// browser dedupes to one module instance — same Transaction class on both sides of signing.
const ALGOSDK_CDN = "https://esm.sh/algosdk@^3.0.0?target=es2022";

const subs = [];
const state = { account: localStorage.getItem(LS_KEY) || null, ready: false, network: NETWORK };
let pera = null;     // PeraWalletConnect instance
let algosdk = null;  // algosdk module
let algod = null;    // Algodv2 client (TestNet)

const explorerFor = (txid) => `https://lora.algokit.io/${NETWORK}/transaction/${txid}`;

function emit(type) {
  try { window.dispatchEvent(new CustomEvent(type, { detail: { ...state } })); } catch (_) {}
  subs.forEach((cb) => { try { cb({ ...state }); } catch (_) {} });
  paintButtons();
}
function setAccount(addr) {
  state.account = addr || null;
  if (addr) localStorage.setItem(LS_KEY, addr);
  else localStorage.removeItem(LS_KEY);
  emit("wallet:change");
}

async function loadDeps() {
  if (pera && algosdk) return;
  const [peraMod, sdkMod] = await Promise.all([import(PERA_CDN), import(ALGOSDK_CDN)]);
  algosdk = sdkMod.default || sdkMod;
  const PeraWalletConnect =
    peraMod.PeraWalletConnect || (peraMod.default && peraMod.default.PeraWalletConnect);
  if (!PeraWalletConnect) throw new Error("Pera Connect failed to load");
  pera = new PeraWalletConnect({ chainId: CHAIN_ID });
  algod = new algosdk.Algodv2("", ALGOD, "");
  pera.connector?.on("disconnect", () => setAccount(null));
}

async function connect() {
  await loadDeps();
  let accounts;
  try { accounts = await pera.connect(); }
  catch (e) {
    if (((e && e.message) || "").toLowerCase().includes("modal is closed")) return null; // user dismissed
    throw e;
  }
  pera.connector?.on("disconnect", () => setAccount(null));
  setAccount(accounts && accounts[0]);
  return state.account;
}
async function disconnect() {
  try { await pera?.disconnect(); } catch (_) {}
  setAccount(null);
}
async function reconnect() {
  try {
    await loadDeps();
    const accounts = await pera.reconnectSession();
    if (accounts && accounts.length) setAccount(accounts[0]);
  } catch (_) { /* no live session — leave state as-is */ }
}

// Sign an array of algosdk.Transaction (one atomic group) with Pera and submit to TestNet.
async function signAndSend(txns) {
  if (!state.account) throw new Error("connect a Pera wallet first");
  await loadDeps();
  const group = txns.map((txn) => ({ txn, signers: [state.account] }));
  const signed = await pera.signTransaction([group]);
  const res = await algod.sendRawTransaction(signed).do();
  const txid = res.txid || res.txId;                      // v3 → txid, v2 → txId
  await algosdk.waitForConfirmation(algod, txid, 6);
  return { txid, network: NETWORK, explorer: explorerFor(txid) };
}
// Convenience: a single payment (defaults to a 0-ALGO self-anchor carrying a note).
async function payment({ to, amountAlgo = 0, note = "" } = {}) {
  if (!state.account) throw new Error("connect a Pera wallet first");
  await loadDeps();
  const sp = await algod.getTransactionParams().do();
  const dest = to || state.account;
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: state.account, receiver: dest,   // algosdk v3 names …
    from: state.account, to: dest,            // … with v2 names as a hedge (extra keys ignored)
    amount: Math.round((amountAlgo || 0) * 1e6),
    note: note ? new TextEncoder().encode(note) : undefined,
    suggestedParams: sp,
  });
  return signAndSend([txn]);
}

/* ── [data-pera-connect] buttons ─────────────────────────────────────── */
function paintButtons() {
  document.querySelectorAll("[data-pera-connect]").forEach((btn) => {
    const a = state.account;
    btn.classList.toggle("is-connected", !!a);
    btn.title = a ? `Pera · ${NETWORK} · click to disconnect` : "Connect a Pera wallet (testnet)";
    btn.innerHTML = a
      ? `<span class="pera-dot"></span>${a.slice(0, 4)}…${a.slice(-4)}`
      : `<span class="pera-dot"></span>Connect Pera`;
  });
}
// Pages that don't ship a static [data-pera-connect] button get one auto-mounted in the titlebar.
function ensureButton() {
  if (document.querySelector("[data-pera-connect]")) return;
  const mount = document.querySelector(".surface-meta") || document.querySelector(".titlebar");
  if (!mount) return;
  const btn = document.createElement("button");
  btn.className = "pera-btn";
  btn.setAttribute("data-pera-connect", "");
  btn.innerHTML = `<span class="pera-dot"></span>Connect Pera`;
  mount.insertBefore(btn, mount.firstChild);
}
function wireButtons() {
  document.querySelectorAll("[data-pera-connect]").forEach((btn) => {
    if (btn.dataset.peraWired) return;
    btn.dataset.peraWired = "1";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try { state.account ? await disconnect() : await connect(); }
      catch (e) {
        try { window.dispatchEvent(new CustomEvent("wallet:error", { detail: { message: e.message } })); } catch (_) {}
      } finally { btn.disabled = false; }
    });
  });
  paintButtons();
}

window.WALLET = {
  get account() { return state.account; },
  get isConnected() { return !!state.account; },
  get network() { return NETWORK; },
  get ready() { return state.ready; },
  connect, disconnect, reconnect, signAndSend, payment, explorerFor,
  onChange(cb) { subs.push(cb); return () => subs.splice(subs.indexOf(cb), 1); },
};

function init() {
  ensureButton();
  wireButtons();
  state.ready = true;
  emit("wallet:ready");
  reconnect();   // resume any existing Pera session (async; fires wallet:change on success)
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
