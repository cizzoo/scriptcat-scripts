// ==UserScript==
// @name         Claude Usage Widget
// @namespace    https://github.com/cizzoo/scriptcat-scripts
// @version      0.1.0
// @description  Floating collapsible widget showing Claude daily (5h window) and weekly usage, with reset time and model label
// @author       cizzoo
// @match        https://claude.ai/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/claude-usage-widget.user.js
// @downloadURL  https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/claude-usage-widget.user.js
// ==/UserScript==

/*
 * NOTES (read before touching this):
 *
 * - This calls claude.ai's INTERNAL, UNDOCUMENTED web API:
 *     GET /api/organizations                -> org list, to find org UUID
 *     GET /api/organizations/{orgId}/usage   -> five_hour / seven_day windows
 *   These are not part of the public Anthropic API and can change shape or
 *   disappear without notice. If this breaks, check the response shape in
 *   devtools network tab before assuming the script is wrong.
 *
 * - Auth: plain same-origin `fetch` with credentials: 'include'. This reuses
 *   the browser's existing claude.ai session cookie automatically. The
 *   cookie itself is NEVER read, stored, or logged by this script.
 * 
 * - Poll interval: 5 minutes (300000ms) 
 *
 * - Request timeout: 5 minutes (300000ms) per the spec, via AbortController.
 *   In practice the endpoint responds in well under a second; the long
 *   timeout just avoids the widget getting stuck on a hung request instead
 *   of failing out to an error state.
 *
 * - Org UUID is cached in GM storage (device-local) to avoid refetching
 *   /api/organizations on every poll. Nothing sensitive: it's an org id,
 *   not a credential, and it never leaves this device (GM storage is local
 *   unless you've turned on ScriptCat's own cloud sync separately).
 */

(function () {
  "use strict";

  const NS = "sc-claude-usage";
  const REQUEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  const POLL_INTERVAL_MS = 300 * 1000; // refresh every 5 minutes while page is open
  const COLLAPSE_KEY = "claudeUsageWidget.collapsed";

  GM_addStyle(`
    #${NS}-root {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 12px;
      color: #e5e5e2;
      background: #262624;
      border: 1px solid #3a3a37;
      border-radius: 10px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.35);
      width: 220px;
      overflow: hidden;
      user-select: none;
    }
    #${NS}-root.${NS}-collapsed {
      width: 150px;
    }
    #${NS}-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      cursor: pointer;
      background: #2f2f2c;
    }
    #${NS}-title {
      font-weight: 600;
      font-size: 11px;
      letter-spacing: 0.02em;
      color: #cfcfca;
    }
    #${NS}-toggle {
      font-size: 10px;
      color: #9a9a94;
      pointer-events: none;
    }
    #${NS}-body {
      padding: 8px 10px 6px;
    }
    #${NS}-root.${NS}-collapsed #${NS}-weekly-block {
      display: none;
    }
    .${NS}-row {
      margin-bottom: 6px;
    }
    .${NS}-row:last-child {
      margin-bottom: 0;
    }
    .${NS}-label {
      display: flex;
      justify-content: space-between;
      font-size: 10.5px;
      color: #b7b7b1;
      margin-bottom: 2px;
    }
    .${NS}-pct {
      font-weight: 600;
      color: #e5e5e2;
    }
    .${NS}-bar-track {
      height: 5px;
      border-radius: 3px;
      background: #3a3a37;
      overflow: hidden;
    }
    .${NS}-bar-fill {
      height: 100%;
      border-radius: 3px;
      background: #d97757;
      transition: width 0.3s ease;
    }
    .${NS}-bar-fill.${NS}-warn {
      background: #e0b23c;
    }
    .${NS}-bar-fill.${NS}-crit {
      background: #d15252;
    }
    #${NS}-reset {
      font-size: 10px;
      color: #8f8f89;
      margin-top: 4px;
    }
    #${NS}-footer {
      display: flex;
      justify-content: flex-end;
      padding: 4px 10px 6px;
    }
    #${NS}-model {
      font-size: 9.5px;
      color: #6f6f68;
      font-style: italic;
    }
    #${NS}-error {
      font-size: 10px;
      color: #d15252;
    }
  `);

  const root = document.createElement("div");
  root.id = `${NS}-root`;
  root.innerHTML = `
    <div id="${NS}-header">
      <span id="${NS}-title">Claude Usage</span>
      <span id="${NS}-toggle">▾</span>
    </div>
    <div id="${NS}-body">
      <div class="${NS}-row">
        <div class="${NS}-label"><span>Daily (5h)</span><span class="${NS}-pct" id="${NS}-daily-pct">–</span></div>
        <div class="${NS}-bar-track"><div class="${NS}-bar-fill" id="${NS}-daily-bar" style="width:0%"></div></div>
      </div>
      <div id="${NS}-weekly-block" class="${NS}-row">
        <div class="${NS}-label"><span>Weekly (7d)</span><span class="${NS}-pct" id="${NS}-weekly-pct">–</span></div>
        <div class="${NS}-bar-track"><div class="${NS}-bar-fill" id="${NS}-weekly-bar" style="width:0%"></div></div>
      </div>
      <div id="${NS}-reset">Resets: –</div>
    </div>
    <div id="${NS}-footer">
      <span id="${NS}-model">–</span>
    </div>
  `;
  document.body.appendChild(root);

  const els = {
    header: root.querySelector(`#${NS}-header`),
    toggle: root.querySelector(`#${NS}-toggle`),
    dailyPct: root.querySelector(`#${NS}-daily-pct`),
    dailyBar: root.querySelector(`#${NS}-daily-bar`),
    weeklyPct: root.querySelector(`#${NS}-weekly-pct`),
    weeklyBar: root.querySelector(`#${NS}-weekly-bar`),
    reset: root.querySelector(`#${NS}-reset`),
    model: root.querySelector(`#${NS}-model`),
  };

  function applyCollapsedState(collapsed) {
    root.classList.toggle(`${NS}-collapsed`, collapsed);
    els.toggle.textContent = collapsed ? "▸" : "▾";
  }

  (async function initCollapsedState() {
    const stored = await GM_getValue(COLLAPSE_KEY, false);
    applyCollapsedState(!!stored);
  })();

  els.header.addEventListener("click", async () => {
    const nowCollapsed = !root.classList.contains(`${NS}-collapsed`);
    applyCollapsedState(nowCollapsed);
    await GM_setValue(COLLAPSE_KEY, nowCollapsed);
  });

  function setBarLevel(barEl, pct) {
    barEl.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    barEl.classList.remove(`${NS}-warn`, `${NS}-crit`);
    if (pct >= 90) barEl.classList.add(`${NS}-crit`);
    else if (pct >= 70) barEl.classList.add(`${NS}-warn`);
  }

  function formatResetTime(resetsAtIso) {
    if (!resetsAtIso) return "–";
    const d = new Date(resetsAtIso);
    if (isNaN(d.getTime())) return "–";
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const timePart = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (sameDay) return `today ${timePart}`;
    const datePart = d.toLocaleDateString([], { month: "short", day: "numeric" });
    return `${datePart} ${timePart}`;
  }

  function pctFromWindow(win) {
    // Web/OAuth usage windows expose utilization as a 0-1 fraction under
    // `utilization`, with a `resets_at` ISO timestamp. Guard defensively
    // since this is an undocumented endpoint and field names have shifted
    // across reports in the wild.
    if (!win) return null;
    const raw =
      typeof win.utilization === "number"
        ? win.utilization
        : typeof win.percent_used === "number"
        ? win.percent_used / 100
        : typeof win.used === "number" && typeof win.limit === "number" && win.limit > 0
        ? win.used / win.limit
        : null;
    if (raw === null) return null;
    return {
      pct: Math.round(raw),
      resetsAt: win.resets_at || win.reset_at || win.resetsAt || null,
    };
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  async function getOrgId() {
    const cached = await GM_getValue("claudeUsageWidget.orgId", null);
    if (cached) return cached;

    const res = await fetchWithTimeout(
      "https://claude.ai/api/organizations",
      { credentials: "include" },
      REQUEST_TIMEOUT_MS
    );
    if (!res.ok) throw new Error(`organizations fetch failed: ${res.status}`);
    const orgs = await res.json();
    if (!Array.isArray(orgs) || orgs.length === 0) {
      throw new Error("no organizations returned");
    }
    const orgId = orgs[0].uuid || orgs[0].id;
    if (!orgId) throw new Error("organization response missing uuid/id");
    await GM_setValue("claudeUsageWidget.orgId", orgId);
    return orgId;
  }

  async function fetchUsage() {
    const orgId = await getOrgId();
    const res = await fetchWithTimeout(
      `https://claude.ai/api/organizations/${orgId}/usage`,
      { credentials: "include" },
      REQUEST_TIMEOUT_MS
    );
    if (res.status === 401 || res.status === 403) {
      // org id cache may be stale (org switch, revoked access) - clear and retry once upstream
      await GM_setValue("claudeUsageWidget.orgId", null);
      throw new Error(`usage fetch unauthorized: ${res.status}`);
    }
    if (!res.ok) throw new Error(`usage fetch failed: ${res.status}`);
    return res.json();
  }

  function showError(message) {
    els.dailyPct.textContent = "err";
    els.weeklyPct.textContent = "err";
    els.reset.innerHTML = `<span id="${NS}-error">${escapeHtml(message)}</span>`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function refresh() {
    let data;
    try {
      data = await fetchUsage();
    } catch (err) {
      showError(err.message || "fetch failed");
      return;
    }

    const daily = pctFromWindow(data.five_hour);
    const weekly = pctFromWindow(data.seven_day);

    if (daily) {
      els.dailyPct.textContent = `${daily.pct}%`;
      setBarLevel(els.dailyBar, daily.pct);
    } else {
      els.dailyPct.textContent = "n/a";
      setBarLevel(els.dailyBar, 0);
    }

    if (weekly) {
      els.weeklyPct.textContent = `${weekly.pct}%`;
      setBarLevel(els.weeklyBar, weekly.pct);
    } else {
      els.weeklyPct.textContent = "n/a";
      setBarLevel(els.weeklyBar, 0);
    }

    const resetsAt = (daily && daily.resetsAt) || (weekly && weekly.resetsAt) || null;
    els.reset.textContent = `Resets: ${formatResetTime(resetsAt)}`;

    const modelLabel =
      data.seven_day_opus && pctFromWindow(data.seven_day_opus)
        ? "Opus"
        : data.seven_day_sonnet && pctFromWindow(data.seven_day_sonnet)
        ? "Sonnet"
        : (data.subscriptionType || data.rate_limit_tier || "").toString();
    els.model.textContent = modelLabel || "";
  }

  refresh();
  setInterval(refresh, POLL_INTERVAL_MS);
})();