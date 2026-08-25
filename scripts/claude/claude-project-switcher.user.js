// ==UserScript==
// @name         Claude Project Switcher
// @namespace    https://github.com/cizzoo/scriptcat-scripts
// @version      0.1.1
// @description  Ctrl+Shift+P launcher overlay to jump to a Claude.ai project by name
// @author       cizzoo
// @match        https://claude.ai/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/claude/claude-project-switcher.user.js
// @downloadURL  https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/claude/claude-project-switcher.user.js
// ==/UserScript==

(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // NOTE ON STABILITY: this script calls claude.ai's internal, undocumented
  // frontend API (the same endpoint the page's own React app calls to render
  // its project list). It is NOT a public/versioned API and Anthropic can
  // change its shape or auth requirements at any time without notice. Every
  // network call below is wrapped so a failure degrades to "overlay still
  // opens, list is just empty" rather than a thrown error. If this breaks,
  // check DevTools > Network on claude.ai's own project list page and update
  // ORG_ID resolution / PROJECTS_PATH accordingly.
  // ---------------------------------------------------------------------

  const NS = "sc-claude-proj-switcher";
  const CACHE_KEY = "sc-claude-proj-switcher:lastProjects";

  let overlayEl = null;
  let inputEl = null;
  let listEl = null;
  let allProjects = [];   // full fetched list, this-tab-session cache
  let filtered = [];
  let activeIndex = 0;
  let fetchedOnce = false;

  // -- styles --------------------------------------------------------------

  GM_addStyle(`
    #${NS}-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 999999;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 12vh;
    }
    #${NS}-panel {
      width: min(560px, 92vw);
      max-height: 60vh;
      background: #262624;
      border: 1px solid #3d3d3a;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #${NS}-input {
      width: 100%;
      box-sizing: border-box;
      border: none;
      outline: none;
      background: transparent;
      color: #f5f4ee;
      font-size: 16px;
      padding: 16px 18px;
      border-bottom: 1px solid #3d3d3a;
    }
    #${NS}-input::placeholder { color: #8a8a86; }
    #${NS}-list {
      overflow-y: auto;
      flex: 1;
      padding: 6px;
    }
    .${NS}-item {
      padding: 10px 12px;
      border-radius: 8px;
      color: #d9d8d1;
      font-size: 14px;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .${NS}-item.active {
      background: #3d3d3a;
      color: #f5f4ee;
    }
    #${NS}-empty {
      padding: 18px;
      color: #8a8a86;
      font-size: 13px;
      text-align: center;
    }
    #${NS}-hint {
      padding: 8px 14px;
      border-top: 1px solid #3d3d3a;
      color: #6d6d69;
      font-size: 11px;
      display: flex;
      justify-content: space-between;
    }
  `);

  // -- org id resolution ----------------------------------------------------

  function getOrgId() {
    // claude.ai's own frontend keeps the active org id in a cookie it reads
    // client-side. Mirror that instead of hardcoding anything account-specific.
    const match = document.cookie.match(/(?:^|;\s*)lastActiveOrg=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
    return null;
  }

  // -- data fetching ----------------------------------------------------

  async function fetchProjects() {
    const orgId = getOrgId();
    if (!orgId) {
      console.warn(`[${NS}] could not resolve org id from cookies; skipping fetch`);
      return [];
    }
    try {
      const res = await fetch(`/api/organizations/${orgId}/projects`, {
        method: "GET",
        credentials: "include",
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        console.warn(`[${NS}] projects fetch failed with status ${res.status}`);
        return [];
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        console.warn(`[${NS}] unexpected projects response shape`, data);
        return [];
      }
      // Normalize defensively - field names may drift.
      const projects = data
        .map((p) => ({
          uuid: p.uuid || p.id,
          name: p.name || p.title || "(untitled project)",
          updatedAt: p.updated_at || p.updatedAt || null,
        }))
        .filter((p) => p.uuid);
      GM_setValue(CACHE_KEY, JSON.stringify(projects));
      return projects;
    } catch (err) {
      console.warn(`[${NS}] projects fetch threw`, err);
      return [];
    }
  }

  function loadCachedProjects() {
    try {
      const raw = GM_getValue(CACHE_KEY, "");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // -- rendering ----------------------------------------------------

  function render() {
    listEl.innerHTML = "";
    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.id = `${NS}-empty`;
      empty.textContent = fetchedOnce ? "No matching projects" : "Loading projects…";
      listEl.appendChild(empty);
      return;
    }
    filtered.forEach((p, i) => {
      const item = document.createElement("div");
      item.className = `${NS}-item${i === activeIndex ? " active" : ""}`;
      item.textContent = p.name;
      item.dataset.index = String(i);
      item.addEventListener("click", () => goToProject(p));
      listEl.appendChild(item);
    });
    const activeEl = listEl.querySelector(".active");
    if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
  }

  function applyFilter(query) {
    const q = query.trim().toLowerCase();
    filtered = q
      ? allProjects.filter((p) => p.name.toLowerCase().includes(q))
      : allProjects.slice();
    activeIndex = 0;
    render();
  }

  function goToProject(project) {
    location.href = `/project/${project.uuid}`;
  }

  // -- overlay lifecycle ----------------------------------------------------

  function openOverlay() {
    if (overlayEl) return;

    overlayEl = document.createElement("div");
    overlayEl.id = `${NS}-backdrop`;

    const panel = document.createElement("div");
    panel.id = `${NS}-panel`;

    inputEl = document.createElement("input");
    inputEl.id = `${NS}-input`;
    inputEl.type = "text";
    inputEl.placeholder = "Search projects…";
    inputEl.autocomplete = "off";

    listEl = document.createElement("div");
    listEl.id = `${NS}-list`;

    const hint = document.createElement("div");
    hint.id = `${NS}-hint`;
    hint.innerHTML = `<span>↑↓ navigate</span><span>Enter select · Esc close</span>`;

    panel.appendChild(inputEl);
    panel.appendChild(listEl);
    panel.appendChild(hint);
    overlayEl.appendChild(panel);
    document.body.appendChild(overlayEl);

    inputEl.addEventListener("input", () => applyFilter(inputEl.value));
    inputEl.addEventListener("keydown", onKeydown);
    overlayEl.addEventListener("mousedown", (e) => {
      if (e.target === overlayEl) closeOverlay();
    });
    // Escape also works if focus ever lands outside the input (e.g. a list
    // item click that doesn't refocus it), not just while typing.
    document.addEventListener("keydown", onDocumentKeydownWhileOpen, true);

    inputEl.focus();

    // Show cached list immediately ("used in the first moment"), then
    // refresh from the network. Every open after the first re-fetches to
    // avoid staleness, but never blocks the initial render.
    allProjects = loadCachedProjects();
    fetchedOnce = false;
    applyFilter("");

    fetchProjects().then((fresh) => {
      fetchedOnce = true;
      if (fresh.length > 0) {
        allProjects = fresh;
      }
      applyFilter(inputEl.value);
    });
  }

  function closeOverlay() {
    if (!overlayEl) return;
    overlayEl.remove();
    overlayEl = null;
    inputEl = null;
    listEl = null;
    document.removeEventListener("keydown", onDocumentKeydownWhileOpen, true);
  }

  function onDocumentKeydownWhileOpen(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeOverlay();
    }
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeOverlay();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length === 0) return;
      activeIndex = (activeIndex + 1) % filtered.length;
      render();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length === 0) return;
      activeIndex = (activeIndex - 1 + filtered.length) % filtered.length;
      render();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const chosen = filtered[activeIndex];
      if (chosen) goToProject(chosen);
    }
  }

  // -- global shortcut ----------------------------------------------------

  document.addEventListener("keydown", (e) => {
    const isShortcut =
      e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "p";
    if (!isShortcut) return;
    e.preventDefault();
    if (overlayEl) {
      closeOverlay();
    } else {
      openOverlay();
    }
  });
})();