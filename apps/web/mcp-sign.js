const params = new URLSearchParams(window.location.search);
const challengeId = params.get("challenge_id") || "";
const apiBase = (params.get("api_base") || "http://localhost:3001").replace(/\/+$/, "");

const facts = document.getElementById("challengeFacts");
const loadState = document.getElementById("loadState");
const signBtn = document.getElementById("signBtn");
const refreshBtn = document.getElementById("refreshBtn");
const statusEl = document.getElementById("status");
const proofOut = document.getElementById("proofOut");

let challenge = null;

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
}

function short(value) {
  if (!value || value.length <= 14) return value || "";
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function fact(label, value, code = false) {
  return `<dt>${label}</dt><dd>${code ? `<code>${value}</code>` : value}</dd>`;
}

function renderChallenge() {
  if (!challenge) return;
  facts.innerHTML = [
    fact("Challenge", challenge.challenge_id, true),
    fact("Agent", short(challenge.agent_id), true),
    fact("Service", challenge.service_id || ""),
    fact("Amount", `${Number(challenge.amount).toFixed(6)} ${challenge.asset}`),
    fact("Pay to", challenge.pay_to, true),
    fact("Network", challenge.network || ""),
    fact("Quote", `${Number(challenge.quote?.amount ?? 0).toFixed(6)} ${challenge.asset}`),
    fact("Quote drift", challenge.quote_drift ? "yes" : "no"),
    fact("Note", challenge.payment_note, true),
    ...(challenge.payment_txid ? [fact("Proof", challenge.payment_txid, true)] : []),
  ].join("");
  signBtn.disabled = Boolean(challenge.payment_txid);
  setStatus(challenge.payment_txid ? "Proof already accepted." : "Ready to sign with Pera.", challenge.payment_txid ? "ok" : "");
}

async function loadChallenge() {
  if (!challengeId) {
    loadState.textContent = "Missing challenge_id in URL.";
    setStatus("Missing challenge_id.", "err");
    return;
  }
  signBtn.disabled = true;
  loadState.textContent = "Loading challenge...";
  proofOut.hidden = true;
  try {
    const res = await fetch(`${apiBase}/api/challenge/${encodeURIComponent(challengeId)}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `challenge fetch failed: ${res.status}`);
    challenge = body;
    renderChallenge();
  } catch (error) {
    loadState.textContent = "Could not load challenge.";
    setStatus(error.message || String(error), "err");
  }
}

async function signPayment() {
  if (!challenge) return;
  const wallet = window.WALLET;
  if (!wallet) {
    setStatus("Pera wallet module is not ready.", "err");
    return;
  }
  signBtn.disabled = true;
  setStatus("Waiting for Pera signature...");
  try {
    if (!wallet.isConnected) {
      await wallet.connect();
    }
    if (!wallet.account) throw new Error("Connect a Pera wallet first.");
    const payment = await wallet.payment({
      to: challenge.pay_to,
      amountAlgo: Number(challenge.amount),
      note: challenge.payment_note,
    });
    setStatus(`Payment confirmed: ${short(payment.txid)}. Verifying proof...`);
    const proofRes = await fetch(`${apiBase}/api/payment-proof`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challenge_id: challenge.challenge_id,
        settlement_txid: payment.txid,
        payer: wallet.account,
      }),
    });
    const proof = await proofRes.json();
    if (!proofRes.ok) throw new Error(proof.error || `proof failed: ${proofRes.status}`);
    proofOut.textContent = JSON.stringify({
      payer: wallet.account,
      settlement_txid: payment.txid,
      explorer: payment.explorer,
      proof,
    }, null, 2);
    proofOut.hidden = false;
    challenge = {
      ...challenge,
      payment_txid: payment.txid,
      payer: wallet.account,
      proof_accepted_at: new Date().toISOString(),
    };
    renderChallenge();
    setStatus(`Proof accepted. Return to Claude with txid ${short(payment.txid)}.`, "ok");
  } catch (error) {
    signBtn.disabled = false;
    setStatus(error.message || String(error), "err");
  }
}

refreshBtn.addEventListener("click", loadChallenge);
signBtn.addEventListener("click", signPayment);
window.addEventListener("wallet:ready", renderChallenge);
window.addEventListener("wallet:change", renderChallenge);

loadChallenge();
