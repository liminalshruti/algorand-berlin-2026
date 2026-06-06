/*
 * nav.js · injects the shared left sidebar into every page.
 * Active item = document.body.dataset.page. Network line reads ARC8004.NET if present.
 */
(function () {
  const PAGES = [
    { page: "router", href: "router.html", ico: "⇄", label: "Trust Router", sub: "operator" },
    { page: "marketplace", href: "marketplace.html", ico: "◎", label: "Marketplace", sub: "client" },
    { page: "studio", href: "studio.html", ico: "▤", label: "Agent Studio", sub: "owner" },
    { page: "contracts", href: "contracts.html", ico: "⚙", label: "Contracts", sub: "developer" },
    { page: "admin", href: "admin.html", ico: "◫", label: "Admin", sub: "observability" },
  ];
  const cur = document.body.dataset.page || "";
  const net = (window.ARC8004 && window.ARC8004.NET) || "testnet";
  const aside = document.createElement("aside");
  aside.className = "sidebar";
  aside.innerHTML = `
    <div class="sb-brand"><span class="diamond">◇</span><span class="sb-word">Liminal</span></div>
    <div class="sb-tag">x402 · ARC-8004 · Algorand</div>
    <nav class="sb-nav">
      ${PAGES.map((p) => `<a class="sb-link ${p.page === cur ? "is-active" : ""}" href="${p.href}" data-page="${p.page}">
        <span class="sb-ico">${p.ico}</span><span>${p.label}</span></a>`).join("")}
    </nav>
    <div class="sb-foot">
      <div class="sb-net ${net}"><span class="dot"></span>ALGORAND · ${net.toUpperCase()}</div>
      <span class="sb-net-mode">mock · flip to live in code</span>
    </div>`;
  document.body.insertBefore(aside, document.body.firstChild);
  document.body.classList.add("has-sidebar");
})();
