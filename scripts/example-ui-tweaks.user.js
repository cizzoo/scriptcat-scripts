// ==UserScript==
// @name         Example UI Tweaks
// @namespace    https://github.com/cizzoo/scriptcat-scripts
// @version      0.1.0
// @description  Demo script: hide clutter, add a floating shortcut button
// @author       cizzoo
// @match        https://example.com/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @updateURL    https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/example-ui-tweaks.user.js
// @downloadURL  https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/example-ui-tweaks.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // --- 1. Hide elements you never want to see ---
  // Prefer CSS injection over JS removal: it's applied once, survives re-renders,
  // and doesn't fight the page's own scripts.
  GM_addStyle(`
    /* Replace these selectors with the ones from your target site */
    .ad-banner,
    .newsletter-popup,
    [data-testid="promo-rail"] {
      display: none !important;
    }
  `);

  // --- 2. Add a floating shortcut button ---
  function addShortcutButton() {
    if (document.getElementById("sc-shortcut-btn")) return; // avoid duplicates on SPA re-renders

    const btn = document.createElement("button");
    btn.id = "sc-shortcut-btn";
    btn.textContent = "⚡";
    btn.title = "Quick action";
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: "999999",
      width: "44px",
      height: "44px",
      borderRadius: "50%",
      border: "none",
      background: "#2563eb",
      color: "#fff",
      fontSize: "18px",
      cursor: "pointer",
      boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    });

    btn.addEventListener("click", async () => {
      // Example: toggle a persisted setting and give feedback
      const enabled = !(await GM_getValue("featureEnabled", false));
      GM_setValue("featureEnabled", enabled);
      btn.style.background = enabled ? "#16a34a" : "#2563eb";
    });

    document.body.appendChild(btn);
  }

  // Sites with client-side routing (SPA) re-render the DOM without a full reload,
  // so re-run setup on relevant mutations instead of only once on load.
  addShortcutButton();
  const observer = new MutationObserver(() => addShortcutButton());
  observer.observe(document.body, { childList: true, subtree: true });
})();
