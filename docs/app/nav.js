/*
 * nav.js · injects the shared sidebar INSIDE the app frame.
 * Layout becomes:  .frame  →  titlebar (full width)
 *                          →  .frame-body → .sidebar | .frame-content (everything else)
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

  const frame = document.querySelector(".frame");
  if (!frame) return;
  const titlebar = frame.querySelector(".titlebar");

  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  sidebar.innerHTML = `
    <div class="sb-brand"><span class="diamond">◇</span><span class="sb-word">Liminal</span></div>
    <div class="sb-tag">x402 · ARC-8004</div>
    <nav class="sb-nav">
      ${PAGES.map((p) => `<a class="sb-link ${p.page === cur ? "is-active" : ""}" href="${p.href}" data-page="${p.page}" title="${p.label} · ${p.sub}">
        <span class="sb-ico">${p.ico}</span><span class="sb-label">${p.label}</span></a>`).join("")}
    </nav>
    <div class="sb-foot">
      <div class="sb-net ${net}"><span class="dot"></span><span class="sb-label">ALGORAND · ${net.toUpperCase()}</span></div>
    </div>`;

  // move everything after the titlebar into a content wrapper, then place
  // sidebar + content side-by-side inside a frame-body (kept within the frame).
  const content = document.createElement("div");
  content.className = "frame-content";
  let n = titlebar ? titlebar.nextSibling : frame.firstChild;
  const rest = [];
  while (n) { rest.push(n); n = n.nextSibling; }
  rest.forEach((node) => content.appendChild(node));

  const body = document.createElement("div");
  body.className = "frame-body";
  body.appendChild(sidebar);
  body.appendChild(content);
  frame.appendChild(body);
  document.body.classList.add("has-sidebar");
})();
