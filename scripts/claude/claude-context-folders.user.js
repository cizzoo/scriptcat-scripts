// ==UserScript==
// @name         Claude Project Context Folders
// @namespace    https://github.com/cizzoo/scriptcat-scripts
// @version      0.4.0
// @description  Visual folders, colour stripes and grouping for the Project knowledge grid on claude.ai, styled from the app's own rendered tokens. Purely cosmetic - Claude itself never sees the folders.
// @author       cizzoo
// @match        https://claude.ai/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @run-at       document-idle
// @noframes
// @updateURL    https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/claude/claude-context-folders.user.js
// @downloadURL  https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/claude/claude-context-folders.user.js
// ==/UserScript==

/* NOTES - design decisions and fragile bits, read before editing
 *
 * SCOPE
 *   Grouping is visual only. Claude's retrieval is unaffected; the folders live
 *   in local GM storage and never reach the server.
 *
 * IDENTITY
 *   The knowledge grid exposes no document id - the React `id` attributes are
 *   `useId` output and change on every mount. The only usable identity is the
 *   file name. That is deliberate rather than a fallback: re-uploading an edited
 *   file keeps its name, so the assignment survives the edit/re-upload loop.
 *   Two files with the same name share one assignment and are flagged as
 *   duplicates rather than disambiguated.
 *
 * UI SHAPE (v0.4.0)
 *   There is no separate folder panel. The group header inside the grid IS the
 *   folder row: dot and name at the left, count and size beside them, every
 *   control at the far right behind a hover reveal, double-click on the name to
 *   rename. Nothing about a folder is managed anywhere else.
 *   Two consequences follow and both are load-bearing:
 *     - Headers render for EMPTY folders too. If they did not, an empty folder
 *       would have no header, and therefore no way to be renamed or deleted.
 *     - Clicking a header collapses that group rather than filtering to it.
 *       Filtering would hide the other headers, taking their controls with them;
 *       collapsing keeps every folder reachable. Collapse state is persisted.
 *   Copy/Paste layout live in a near-invisible strip BELOW the grid. They are
 *   the only way to move a layout between devices, so they cannot simply go.
 *
 * STORAGE
 *   `folders[].collapsed` was added in 0.4.0. It is additive: an older build
 *   ignores the key and behaves as if every group were open, so this is a minor
 *   bump rather than a schema break.
 *
 * THEMING - amends claude-ai-style-spec.md §2
 *   §2 forbids reading the app's CSS custom properties and Tailwind class names,
 *   because both are build artefacts. That still holds for reading them BY NAME.
 *   This script instead samples getComputedStyle from named reference nodes that
 *   are structurally identifiable, and copies the results into its own `--sc-*`
 *   properties:
 *     text-100 / font  <- a card's <h3> title
 *     text-500         <- the size line under it
 *     text-300         <- the "Context" section <h3>
 *     border           <- a card button's border colour
 *     raised           <- a card button's background
 *     accent           <- the capacity progressbar's fill child
 *   No class name and no variable name is referenced. This is the same principle
 *   §2 already mandates for the background luminance sniff, applied to the whole
 *   palette, and it makes the light theme correct for free. Hardcoded dark values
 *   remain only as fallbacks for when a reference node is missing.
 *
 * REACT SAFETY
 *   Never write `class` or `style` onto a React-owned node - the next render
 *   reconciles them away. Custom `data-sc-*` attributes survive, because React
 *   only diffs props it knows about. All state on native nodes is expressed as
 *   data attributes; every visual consequence comes from our stylesheet.
 *   Ordering uses pregenerated `[data-sc-o="N"]{order:N}` rules for the same
 *   reason. Because the grid is `display:grid` and position is driven by
 *   `order`, the DOM position of our injected headers is irrelevant - we append
 *   them and let `order` place them, so we never reparent a React node.
 *   Header nodes are pooled and reused across different folders, so their
 *   handlers must never close over a folder. They read `dataset.folder` at click
 *   time instead.
 *
 * CLONED CONTROLS
 *   Both injected buttons - "New folder" in the section header, "Move to folder"
 *   in the native selection bar - are cloned from an adjacent native button and
 *   have only their icon swapped. That inherits the app's entire button
 *   treatment, including hover, focus ring and disabled states.
 *
 * THE SELECTION BAR IS FOUND STRUCTURALLY, NOT BY SELECTOR
 *   Its markup has never been inspected, so instead of guessing class names the
 *   bar is located by the one structural fact visible from outside: it holds a
 *   tri-state checkbox, which reports `aria-checked="mixed"` or carries
 *   `data-indeterminate`. From there the enclosing container and its buttons are
 *   walked, and the move button is placed before the second-from-last one. This
 *   is a heuristic awaiting real selectors. If it fails, a fallback row appears
 *   under the grid so files can still be assigned.
 *
 * NATIVE SEARCH
 *   The section's own "Search files" control filters this same grid, so this
 *   script offers no search box. Whether the app unmounts non-matching cards or
 *   merely hides them is unknown, so cards are tested with `offsetParent` and
 *   hidden ones are excluded from grouping and counts. Caveat: a card we hid via
 *   collapse is not re-tested, so a count can overcount by the overlap.
 *
 * AVOIDING FLICKER - do not undo these without measuring
 *   1. Apply inside the MutationObserver callback, coalesced with rAF. Records
 *      arrive as microtasks before paint, so a React remount that strips our
 *      attributes is repaired in the same frame and never painted.
 *   2. Short-circuit on a state signature; only touch the DOM on real change.
 *   3. Write attributes only when the value differs.
 *   4. Headers are pooled and hidden, never detached. `.sc-head[hidden]` needs
 *      an explicit rule: our `display:flex` outranks the UA sheet.
 *   5. Never rebuild a control that holds focus - this is also what keeps an
 *      in-progress rename alive across renders.
 *   6. All layout reads happen before any write.
 *
 * SELECTORS - likely breakage points, in order of risk
 *   [role="checkbox"][aria-checked="mixed"]         selection-bar locator
 *   [data-testid="project-doc-uploader-dropdown-trigger"]  clone source; its
 *                                                   parent is the header group
 *   [data-testid="file-thumbnail"]                  card root
 *   button[aria-label]:not([aria-label="Remove"])   "name, ext, size" label
 *   h3 inside the card                              file name
 *   [role="checkbox"] + aria-checked                per-card selection
 *   [role="progressbar"] > *                        accent sample
 *   closest("ul")                                   the grid
 *
 * KNOWN LIMITATIONS
 *   - Only the first knowledge grid on the page is managed.
 *   - Tokens and the sampler should move to lib/claude-ui.js (spec §10) when the
 *     usage widget is next touched, so both scripts switch together.
 *   - One jump remains on first load: the app paints the grid before a
 *     document-idle script can run.
 */

(function () {
  "use strict";

  /* ---------------------------------------------------------------- config */

  const NS = "sc-claude-context";
  const SCHEMA = 1;
  const MAX_ORDER = 255;
  const MIN_VIEWPORT = 768;
  const SCAN_MS = 250;
  const CONFIRM_MS = 3000;

  // Folder palette. Fills only - never text, never a bar fill - so folder
  // colour stays in a different visual channel from the app's own accent.
  const PALETTE = [
    { id: 1, name: "Orchid", hex: "#cd74e7" },
    { id: 2, name: "Rose", hex: "#f791b3" },
    { id: 3, name: "Amber", hex: "#ffad44" },
    { id: 4, name: "Sand", hex: "#f9d364" },
    { id: 5, name: "Moss", hex: "#b3dd6a" },
    { id: 6, name: "Fern", hex: "#7ad148" },
  ];

  const UNFILED = "__unfiled";
  const NEW_FOLDER_NAME = "Untitled folder";

  const SVG_OPEN =
    '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" ' +
    'stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" ' +
    'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="flex-shrink:0">';
  const ICON_NEW_FOLDER =
    SVG_OPEN +
    '<path d="M2.5 5.5a1 1 0 0 1 1-1h3.2a1 1 0 0 1 .8.4l.9 1.2h8.1a1 1 0 0 1 1 1v7.4a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z"/>' +
    '<path d="M10 9.4v3.8M8.1 11.3h3.8" stroke-linecap="round"/></svg>';
  const ICON_MOVE =
    SVG_OPEN +
    '<path d="M2.5 5.5a1 1 0 0 1 1-1h3.2a1 1 0 0 1 .8.4l.9 1.2h8.1a1 1 0 0 1 1 1v7.4a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z"/>' +
    '<path d="M7.6 11.3h4.8m-1.9-1.9 1.9 1.9-1.9 1.9" stroke-linecap="round"/></svg>';
  const ICON_TRASH =
    SVG_OPEN +
    '<path d="M4.4 6.1h11.2M8.2 6.1V4.8a.8.8 0 0 1 .8-.8h2a.8.8 0 0 1 .8.8v1.3M6 6.1l.6 8.4a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.4" stroke-linecap="round"/></svg>';
  const ICON_UP =
    SVG_OPEN + '<path d="M10 15V5m-4 4 4-4 4 4" stroke-linecap="round"/></svg>';
  const ICON_DOWN =
    SVG_OPEN + '<path d="M10 5v10m4-4-4 4-4-4" stroke-linecap="round"/></svg>';

  // Fallbacks only. Live values are sampled from the app - see the NOTES block.
  const FALLBACK = {
    t100: "#e5e5e2",
    t300: "#b7b7b1",
    t500: "#8f8f89",
    border: "#3a3a37",
    raised: "#2f2f2c",
    accent: "#d97757",
    crit: "#d15252",
    font: '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
  };

  /* ----------------------------------------------------------------- state */

  let projectId = null;
  let state = null;
  let grid = null;
  let root = null;
  let newFolderBtn = null;
  let moveBtn = null;
  let menu = null;
  const els = {};
  let headerPool = [];
  let tokens = Object.assign({}, FALLBACK);
  let applying = false;
  let frame = 0;
  let gridObserver = null;
  let themeObserver = null;
  let bodyObserver = null;
  let pendingDelete = null;
  let editingId = null;
  let selectedCount = 0;

  let lastSig = "";
  let lastMoveSig = "";

  /* ---------------------------------------------------------------- styles */

  function orderRules() {
    let out = "";
    for (let i = 0; i <= MAX_ORDER; i++) out += `[data-sc-o="${i}"]{order:${i}}`;
    return out;
  }

  function colourRules() {
    return PALETTE.map(
      (c) => `[data-sc-c="${c.id}"]::before{background:${c.hex}}`
    ).join("");
  }

  GM_addStyle(`
    /* --- group header: the folder row ---------------------------------- */
    .${NS}-head{
      grid-column:1 / -1;
      display:flex; align-items:center; gap:6px;
      min-height:26px; margin-top:4px; border-radius:4px;
      font-family:var(--sc-font,${FALLBACK.font});
    }
    /* Must outrank our own display:flex above, not just the UA sheet. */
    .${NS}-head[hidden]{display:none}
    .${NS}-head:hover{background:var(--sc-raised,${FALLBACK.raised})}
    .${NS}-head button:focus-visible,
    .${NS}-head input:focus-visible,
    #${NS}-bar button:focus-visible,
    #${NS}-bar select:focus-visible,
    #${NS}-bar textarea:focus-visible,
    #${NS}-menu button:focus-visible{
      outline:1px solid var(--sc-accent,${FALLBACK.accent}); outline-offset:2px;
    }

    .${NS}-head-btn{
      display:flex; align-items:center; gap:6px; flex:0 1 auto; min-width:0;
      height:26px; padding:0 4px 0 6px; border:0; border-radius:4px;
      background:transparent; cursor:pointer; font-family:inherit; text-align:left;
    }
    .${NS}-caret{
      width:9px; flex:0 0 auto; font-size:9px; line-height:1;
      color:var(--sc-t500,${FALLBACK.t500});
    }
    .${NS}-dot{width:9px; height:9px; border-radius:3px; flex:0 0 auto}
    .${NS}-dot[data-empty="1"]{border:1px solid var(--sc-border,${FALLBACK.border}); background:transparent}
    .${NS}-head-name{
      font-size:11px; font-weight:600; letter-spacing:.02em;
      color:var(--sc-t300,${FALLBACK.t300});
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    .${NS}-head-meta{
      font-size:10px; color:var(--sc-t500,${FALLBACK.t500});
      font-variant-numeric:tabular-nums; flex:0 0 auto;
    }
    .${NS}-head-rule{
      flex:1 1 auto; min-width:8px; height:1px;
      background:var(--sc-border,${FALLBACK.border});
    }

    /* Controls sit past the rule, hard right, and displace the meta text. */
    .${NS}-head-ctl{display:none; align-items:center; gap:1px; padding-right:2px}
    .${NS}-head:hover .${NS}-head-ctl,
    .${NS}-head:focus-within .${NS}-head-ctl{display:flex}
    .${NS}-head:hover .${NS}-head-meta,
    .${NS}-head:focus-within .${NS}-head-meta{display:none}

    .${NS}-icon{
      width:22px; height:22px; flex:0 0 auto; padding:0;
      display:flex; align-items:center; justify-content:center;
      border:0; border-radius:4px; background:transparent;
      color:var(--sc-t500,${FALLBACK.t500}); cursor:pointer;
    }
    .${NS}-icon:hover{color:var(--sc-t100,${FALLBACK.t100})}
    .${NS}-icon[data-confirm="1"]{color:var(--sc-crit,${FALLBACK.crit})}
    .${NS}-swatch{
      width:22px; height:22px; flex:0 0 auto; padding:0;
      display:flex; align-items:center; justify-content:center;
      border:0; border-radius:4px; background:transparent; cursor:pointer;
    }

    .${NS}-edit{
      flex:1 1 auto; min-width:0; height:22px; padding:0 6px;
      border-radius:4px; border:1px solid var(--sc-accent,${FALLBACK.accent});
      background:transparent; color:var(--sc-t100,${FALLBACK.t100});
      font-size:11px; font-family:inherit;
    }
    .${NS}-head[data-editing="1"] .${NS}-head-btn,
    .${NS}-head[data-editing="1"] .${NS}-head-meta,
    .${NS}-head[data-editing="1"] .${NS}-head-rule,
    .${NS}-head[data-editing="1"] .${NS}-head-ctl{display:none}
    .${NS}-head:not([data-editing="1"]) .${NS}-edit{display:none}

    /* --- strip below the grid ------------------------------------------ */
    #${NS}-bar{
      font-family:var(--sc-font,${FALLBACK.font});
      font-size:12px; color:var(--sc-t300,${FALLBACK.t300});
      display:flex; flex-direction:column; gap:2px; margin:8px 0 0;
    }
    #${NS}-bar[hidden]{display:none}
    #${NS}-bar *{box-sizing:border-box}
    #${NS}-foot{
      display:flex; align-items:center; gap:8px; padding:0 6px;
      opacity:0; transition:opacity .15s ease;
    }
    #${NS}-bar:hover #${NS}-foot,
    #${NS}-bar:focus-within #${NS}-foot{opacity:1}
    .${NS}-link{
      border:0; background:transparent; padding:0; cursor:pointer;
      font-family:inherit; font-size:10px;
      color:var(--sc-t500,${FALLBACK.t500}); text-decoration:underline;
    }
    .${NS}-link:hover{color:var(--sc-t100,${FALLBACK.t100})}
    #${NS}-io{
      width:100%; min-height:70px; resize:vertical; padding:6px; margin-top:4px;
      border-radius:4px; border:1px solid var(--sc-border,${FALLBACK.border});
      background:transparent; color:var(--sc-t100,${FALLBACK.t100});
      font-family:ui-monospace,monospace; font-size:10.5px;
    }
    #${NS}-msg{font-size:10px; color:var(--sc-t500,${FALLBACK.t500}); margin:2px 6px 0}
    #${NS}-msg[data-err="1"]{color:var(--sc-crit,${FALLBACK.crit})}
    #${NS}-io[hidden],#${NS}-apply[hidden],#${NS}-fallbackmove[hidden]{display:none}

    /* Only used when the native selection bar could not be located. */
    #${NS}-fallbackmove{
      display:flex; align-items:center; gap:6px; margin:2px 0;
      padding:5px 6px; border-radius:4px;
      border:1px solid var(--sc-border,${FALLBACK.border});
      font-size:11px; color:var(--sc-t300,${FALLBACK.t300});
    }
    #${NS}-fallbackselect{
      height:22px; border-radius:3px; font-size:11px; font-family:inherit;
      border:1px solid var(--sc-border,${FALLBACK.border});
      background:transparent; color:var(--sc-t100,${FALLBACK.t100}); cursor:pointer;
    }

    /* --- move-to menu --------------------------------------------------- */
    #${NS}-menu{
      position:fixed; z-index:999999; min-width:170px; max-height:280px;
      overflow:auto; padding:4px; border-radius:10px;
      border:1px solid var(--sc-border,${FALLBACK.border});
      background:var(--sc-raised,${FALLBACK.raised});
      box-shadow:0 4px 16px rgba(0,0,0,0.35);
      font-family:var(--sc-font,${FALLBACK.font});
    }
    .${NS}-mitem{
      display:flex; align-items:center; gap:7px; width:100%;
      height:26px; padding:0 8px; border:0; border-radius:4px;
      background:transparent; cursor:pointer; font-family:inherit;
      font-size:12px; color:var(--sc-t300,${FALLBACK.t300}); text-align:left;
    }
    .${NS}-mitem:hover{color:var(--sc-t100,${FALLBACK.t100}); background:rgba(127,127,127,0.14)}

    /* --- card decoration (data attributes only) ------------------------- */
    [data-sc-c]{position:relative}
    [data-sc-c]::before{
      content:""; position:absolute; left:0; top:10px; bottom:10px;
      width:3px; border-radius:0 3px 3px 0;
      pointer-events:none; z-index:1;
    }
    ${colourRules()}

    [data-sc-dup="1"]::after{
      content:"dup"; position:absolute; top:-6px; left:-6px; z-index:2;
      padding:0 4px; border-radius:3px;
      background:${FALLBACK.crit}; color:#fff;
      font-family:var(--sc-font,${FALLBACK.font});
      font-size:9.5px; line-height:14px; pointer-events:none;
    }

    [data-sc-hide="1"]{display:none !important}
    ${orderRules()}

    @media (max-width:${MIN_VIEWPORT - 1}px){
      #${NS}-bar,.${NS}-head{display:none}
    }
    @media (prefers-reduced-motion:reduce){
      #${NS}-bar *,#${NS}-foot{transition:none !important}
    }
  `);

  /* --------------------------------------------------------------- helpers */

  function uid(prefix) {
    return prefix + Math.random().toString(36).slice(2, 8);
  }

  function setData(el, key, value) {
    if (value === null || value === undefined) {
      if (el.dataset[key] !== undefined) delete el.dataset[key];
      return;
    }
    const next = String(value);
    if (el.dataset[key] !== next) el.dataset[key] = next;
  }

  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  function parseSize(text) {
    const m = /([\d.]+)\s*(B|kB|KB|MB|GB)/i.exec(text || "");
    if (!m) return 0;
    const n = parseFloat(m[1]);
    const u = m[2].toLowerCase();
    const mult = u === "b" ? 1 : u === "kb" ? 1e3 : u === "mb" ? 1e6 : 1e9;
    return n * mult;
  }

  function formatSize(bytes) {
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + "MB";
    if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + "kB";
    return Math.round(bytes) + "B";
  }

  function colourHex(id) {
    const c = PALETTE.find((p) => p.id === id);
    return c ? c.hex : PALETTE[0].hex;
  }

  function randomColour() {
    const used = state.folders.map((f) => f.color);
    const free = PALETTE.filter((p) => !used.includes(p.id));
    const pool = free.length ? free : PALETTE;
    return pool[Math.floor(Math.random() * pool.length)].id;
  }

  function folderById(id) {
    return state.folders.find((f) => f.id === id) || null;
  }

  function scheduleRender() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      try {
        render();
      } catch (err) {
        /* fail quietly */
      }
    });
  }

  function invalidate() {
    lastSig = "";
    scheduleRender();
  }

  /* -------------------------------------------------------- token sampling */

  function usable(value) {
    return (
      value &&
      value !== "transparent" &&
      value !== "rgba(0, 0, 0, 0)" &&
      value !== "none"
    );
  }

  // Read the app's own rendered values instead of naming its tokens. See NOTES.
  function sampleTokens() {
    const next = Object.assign({}, FALLBACK);
    if (!grid) return next;

    const card = grid.querySelector('[data-testid="file-thumbnail"]');
    if (card) {
      const face = card.querySelector(
        'button[aria-label]:not([aria-label="Remove"])'
      );
      const title = card.querySelector("h3");
      const meta = title && title.nextElementSibling;

      if (face) {
        const cs = getComputedStyle(face);
        if (usable(cs.borderTopColor)) next.border = cs.borderTopColor;
        if (usable(cs.backgroundColor)) next.raised = cs.backgroundColor;
      }
      if (title) {
        const cs = getComputedStyle(title);
        if (usable(cs.color)) next.t100 = cs.color;
        if (cs.fontFamily) next.font = cs.fontFamily;
      }
      if (meta) {
        const cs = getComputedStyle(meta);
        if (usable(cs.color)) next.t500 = cs.color;
      }
    }

    const anchor = document.querySelector(
      '[data-testid="project-doc-uploader-dropdown-trigger"]'
    );
    const heading =
      anchor && anchor.parentElement && anchor.parentElement.parentElement
        ? anchor.parentElement.parentElement.querySelector("h3")
        : null;
    if (heading) {
      const cs = getComputedStyle(heading);
      if (usable(cs.color)) next.t300 = cs.color;
    }

    const meter = document.querySelector('[role="progressbar"]');
    const fill = meter && meter.firstElementChild;
    if (fill) {
      const cs = getComputedStyle(fill);
      if (usable(cs.backgroundColor)) next.accent = cs.backgroundColor;
    }

    return next;
  }

  function applyTokens(target) {
    if (!target) return;
    target.style.setProperty("--sc-t100", tokens.t100);
    target.style.setProperty("--sc-t300", tokens.t300);
    target.style.setProperty("--sc-t500", tokens.t500);
    target.style.setProperty("--sc-border", tokens.border);
    target.style.setProperty("--sc-raised", tokens.raised);
    target.style.setProperty("--sc-accent", tokens.accent);
    target.style.setProperty("--sc-crit", tokens.crit);
    target.style.setProperty("--sc-font", tokens.font);
  }

  function tokenSignature() {
    return Object.values(tokens).join("|");
  }

  /* --------------------------------------------------------------- storage */

  function storageKey() {
    return "claudeContextFolders." + projectId;
  }

  function blankState() {
    return { schema: SCHEMA, folders: [], items: {} };
  }

  function normalise(raw) {
    const s = blankState();
    if (!raw || typeof raw !== "object") return s;
    if (Array.isArray(raw.folders)) {
      s.folders = raw.folders
        .filter((f) => f && typeof f.id === "string" && typeof f.name === "string")
        .map((f, i) => ({
          id: f.id,
          name: f.name,
          color: PALETTE.some((p) => p.id === f.color) ? f.color : PALETTE[0].id,
          order: typeof f.order === "number" ? f.order : i,
          collapsed: f.collapsed === true,
        }))
        .sort((a, b) => a.order - b.order)
        .map((f, i) => ({ ...f, order: i }));
    }
    if (raw.items && typeof raw.items === "object") {
      for (const [k, v] of Object.entries(raw.items)) {
        if (v && typeof v.f === "string") s.items[k] = { f: v.f };
      }
    }
    return s;
  }

  function loadState() {
    state = normalise(GM_getValue(storageKey(), null));
    const ids = new Set(state.folders.map((f) => f.id));
    for (const key of Object.keys(state.items)) {
      if (!ids.has(state.items[key].f)) delete state.items[key];
    }
  }

  function saveState() {
    if (!projectId) return;
    if (!state.folders.length && !Object.keys(state.items).length) {
      GM_deleteValue(storageKey());
      return;
    }
    GM_setValue(storageKey(), state);
  }

  /* ------------------------------------------------------------------ DOM */

  function findGrid() {
    const card = document.querySelector('[data-testid="file-thumbnail"]');
    return card ? card.closest("ul") : null;
  }

  function wrapperOf(card, container) {
    let node = card;
    while (node && node.parentElement !== container) node = node.parentElement;
    return node;
  }

  // All layout reads live here, ahead of every write in a render pass.
  function readCards() {
    if (!grid) return [];
    const out = [];
    const cards = grid.querySelectorAll('[data-testid="file-thumbnail"]');
    for (const card of cards) {
      const wrapper = wrapperOf(card, grid);
      if (!wrapper) continue;

      const heading = card.querySelector("h3");
      const labelled = card.querySelector(
        'button[aria-label]:not([aria-label="Remove"])'
      );
      const label = labelled ? labelled.getAttribute("aria-label") : "";
      const parts = label ? label.split(", ") : [];

      let name = heading ? heading.textContent.trim() : "";
      if (!name && parts.length >= 3) name = parts.slice(0, -2).join(", ");
      if (!name) continue;

      let sizeText = parts.length >= 3 ? parts[parts.length - 1] : "";
      if (!sizeText && heading && heading.nextElementSibling) {
        sizeText = heading.nextElementSibling.textContent.trim();
      }

      const box = card.querySelector('[role="checkbox"]');
      out.push({
        wrapper,
        name,
        bytes: parseSize(sizeText),
        checkbox: box,
        checked: box ? box.getAttribute("aria-checked") === "true" : false,
        nativeHidden: !wrapper.dataset.scHide && wrapper.offsetParent === null,
      });
    }

    // If everything reads as hidden the section is collapsed, not filtered.
    if (out.length && out.every((f) => f.nativeHidden)) {
      for (const f of out) f.nativeHidden = false;
    }
    return out;
  }

  function clearCardAttributes() {
    if (!grid) return;
    for (const node of grid.children) {
      delete node.dataset.scO;
      delete node.dataset.scC;
      delete node.dataset.scHide;
      delete node.dataset.scDup;
    }
  }

  /* -------------------------------------------------- cloned native buttons */

  function swapIcon(button, svg) {
    const icon = button.querySelector('[data-cds="Icon"]');
    const holder = document.createElement("span");
    holder.style.cssText =
      "width:16px;height:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0";
    holder.innerHTML = svg; // static literal, no runtime data
    if (icon) icon.replaceWith(holder);
    else button.appendChild(holder);
  }

  function stripCloneAttributes(button, id, label) {
    button.id = id;
    for (const attr of [
      "data-testid",
      "aria-haspopup",
      "aria-expanded",
      "aria-describedby",
      "aria-pressed",
      "data-base-ui-tooltip-trigger",
    ]) {
      button.removeAttribute(attr);
    }
    button.setAttribute("aria-label", label);
  }

  function ensureNewFolderButton() {
    const anchor = document.querySelector(
      '[data-testid="project-doc-uploader-dropdown-trigger"]'
    );
    if (!anchor || !anchor.parentElement) return;
    const group = anchor.parentElement;
    if (newFolderBtn && newFolderBtn.parentElement === group) return;
    if (newFolderBtn) newFolderBtn.remove();

    const btn = anchor.cloneNode(true);
    stripCloneAttributes(btn, NS + "-new", "New folder");
    btn.classList.remove("-mr-2"); // that margin belongs to the last button
    swapIcon(btn, ICON_NEW_FOLDER);
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onAddFolder();
    });
    group.insertBefore(btn, group.firstChild);
    newFolderBtn = btn;
  }

  // Located structurally rather than by selector - see the NOTES block.
  function findSelectionBar() {
    const mixed = document.querySelector(
      '[role="checkbox"][aria-checked="mixed"],[data-cds="Checkbox"][data-indeterminate]'
    );
    if (!mixed) return null;
    let node = mixed.parentElement;
    for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
      const buttons = Array.from(node.querySelectorAll("button")).filter(
        (b) => b.id !== NS + "-move"
      );
      if (buttons.length >= 2) return { container: node, buttons };
    }
    return null;
  }

  function ensureMoveButton() {
    const bar = selectedCount > 0 ? findSelectionBar() : null;
    if (!bar) {
      if (moveBtn) {
        moveBtn.remove();
        moveBtn = null;
      }
      return false;
    }
    if (moveBtn && moveBtn.isConnected) return true;

    // Second from the end is the destructive action; the last one closes.
    const trash = bar.buttons[bar.buttons.length - 2] || bar.buttons[0];
    const btn = trash.cloneNode(true);
    stripCloneAttributes(btn, NS + "-move", "Move to folder");
    swapIcon(btn, ICON_MOVE);
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMoveMenu(btn);
    });
    trash.parentElement.insertBefore(btn, trash);
    moveBtn = btn;
    return true;
  }

  /* ------------------------------------------------------------- move menu */

  function closeMoveMenu() {
    if (!menu) return;
    menu.remove();
    menu = null;
    document.removeEventListener("mousedown", onMenuOutside, true);
    document.removeEventListener("keydown", onMenuKey, true);
  }

  function onMenuOutside(event) {
    if (menu && !menu.contains(event.target)) closeMoveMenu();
  }

  function onMenuKey(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeMoveMenu();
    }
  }

  function openMoveMenu(anchor) {
    closeMoveMenu();
    menu = document.createElement("div");
    menu.id = NS + "-menu";
    menu.setAttribute("role", "menu");
    applyTokens(menu);

    if (!state.folders.length) {
      const note = document.createElement("div");
      note.className = NS + "-mitem";
      note.textContent = "Create a folder first";
      menu.appendChild(note);
    } else {
      const targets = state.folders
        .map((f) => ({ id: f.id, name: f.name, color: f.color }))
        .concat([{ id: UNFILED, name: "Unfiled", color: null }]);

      for (const target of targets) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = NS + "-mitem";
        item.setAttribute("role", "menuitem");
        const dot = document.createElement("span");
        dot.className = NS + "-dot";
        if (target.color) dot.style.background = colourHex(target.color);
        else dot.dataset.empty = "1";
        const text = document.createElement("span");
        text.textContent = target.name;
        item.append(dot, text);
        item.addEventListener("click", () => {
          closeMoveMenu();
          moveSelectionTo(target.id);
        });
        menu.appendChild(item);
      }
    }

    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(rect.left, document.documentElement.clientWidth - menu.offsetWidth - 8)
    );
    menu.style.top = rect.bottom + 6 + "px";
    menu.style.left = left + "px";

    document.addEventListener("mousedown", onMenuOutside, true);
    document.addEventListener("keydown", onMenuKey, true);
    const first = menu.querySelector("button");
    if (first) first.focus();
  }

  /* --------------------------------------------------------- strip below */

  const BAR_HTML = `
    <div id="${NS}-fallbackmove" hidden>
      <span id="${NS}-fallbackcount"></span>
      <select id="${NS}-fallbackselect" aria-label="Move the selected files to a folder"></select>
    </div>
    <div id="${NS}-foot">
      <button type="button" id="${NS}-export" class="${NS}-link">Copy layout</button>
      <button type="button" id="${NS}-import" class="${NS}-link">Paste layout</button>
      <button type="button" id="${NS}-apply" class="${NS}-link" hidden>Apply</button>
    </div>
    <textarea id="${NS}-io" hidden spellcheck="false" aria-label="Layout as JSON"></textarea>
    <p id="${NS}-msg"></p>
  `;

  function buildBar() {
    root = document.createElement("div");
    root.id = NS + "-bar";
    root.innerHTML = BAR_HTML; // static skeleton, no runtime data

    els.fallback = root.querySelector("#" + NS + "-fallbackmove");
    els.fallbackCount = root.querySelector("#" + NS + "-fallbackcount");
    els.fallbackSelect = root.querySelector("#" + NS + "-fallbackselect");
    els.export = root.querySelector("#" + NS + "-export");
    els.import = root.querySelector("#" + NS + "-import");
    els.apply = root.querySelector("#" + NS + "-apply");
    els.io = root.querySelector("#" + NS + "-io");
    els.msg = root.querySelector("#" + NS + "-msg");

    els.fallbackSelect.addEventListener("change", () => {
      const target = els.fallbackSelect.value;
      if (!target) return;
      els.fallbackSelect.value = "";
      moveSelectionTo(target);
    });
    els.export.addEventListener("click", onExport);
    els.import.addEventListener("click", () => {
      els.io.hidden = false;
      els.apply.hidden = false;
      els.io.value = "";
      els.io.focus();
      say("Paste a layout, then apply it. This replaces the current one.");
    });
    els.apply.addEventListener("click", onImport);

    return root;
  }

  function say(text, isError) {
    els.msg.textContent = text || "";
    if (isError) els.msg.dataset.err = "1";
    else delete els.msg.dataset.err;
  }

  function ensureBar() {
    if (!root) buildBar();
    if (root.previousElementSibling !== grid) {
      grid.parentElement.insertBefore(root, grid.nextSibling);
    }
  }

  /* ------------------------------------------------------------- headers */

  function buildHeader() {
    const node = document.createElement("div");
    node.className = NS + "-head";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = NS + "-head-btn";
    const caret = document.createElement("span");
    caret.className = NS + "-caret";
    const dot = document.createElement("span");
    dot.className = NS + "-dot";
    const name = document.createElement("span");
    name.className = NS + "-head-name";
    btn.append(caret, dot, name);

    const edit = document.createElement("input");
    edit.type = "text";
    edit.className = NS + "-edit";
    edit.setAttribute("aria-label", "Folder name");

    const meta = document.createElement("span");
    meta.className = NS + "-head-meta";
    const rule = document.createElement("span");
    rule.className = NS + "-head-rule";

    const ctl = document.createElement("div");
    ctl.className = NS + "-head-ctl";
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = NS + "-swatch";
    const chip = document.createElement("span");
    chip.className = NS + "-dot";
    swatch.appendChild(chip);
    const up = iconShell(ICON_UP);
    const down = iconShell(ICON_DOWN);
    const trash = iconShell(ICON_TRASH);
    ctl.append(swatch, up, down, trash);

    node.append(btn, edit, meta, rule, ctl);
    node._parts = { btn, caret, dot, name, edit, meta, ctl, swatch, chip, up, down, trash };

    // Pooled nodes are reused for different folders, so every handler resolves
    // the folder from the node's dataset at click time - never from a closure.
    btn.addEventListener("click", (event) => {
      if (event.detail > 1) return; // second click of a rename double-click
      toggleCollapse(node.dataset.folder);
    });
    btn.addEventListener("dblclick", (event) => {
      event.preventDefault();
      beginRename(node);
    });
    edit.addEventListener("blur", () => commitRename(node));
    edit.addEventListener("keydown", (event) => {
      if (event.key === "Enter") edit.blur();
      if (event.key === "Escape") {
        const folder = folderById(node.dataset.folder);
        edit.value = folder ? folder.name : "";
        edit.blur();
      }
    });
    swatch.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      cycleColour(node.dataset.folder);
    });
    up.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      reorder(node.dataset.folder, -1);
    });
    down.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      reorder(node.dataset.folder, 1);
    });
    trash.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onDeleteFolder(node.dataset.folder);
    });

    return node;
  }

  function iconShell(svg) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = NS + "-icon";
    b.innerHTML = svg; // static literal, no runtime data
    return b;
  }

  function headerNode(index) {
    if (!headerPool[index]) headerPool[index] = buildHeader();
    return headerPool[index];
  }

  function paintHeader(node, group) {
    const p = node._parts;
    const isFolder = group.id !== UNFILED;
    const collapsed = !!group.collapsed;

    setData(node, "folder", group.id);
    applyTokens(node);

    setText(p.caret, collapsed ? "▸" : "▾");
    p.dot.style.background = group.color ? colourHex(group.color) : "transparent";
    setData(p.dot, "empty", group.color ? "0" : "1");
    setText(p.name, group.name);

    p.btn.setAttribute("aria-expanded", String(!collapsed));
    p.btn.setAttribute(
      "aria-label",
      (collapsed ? "Expand " : "Collapse ") + group.name
    );

    const count = group.files.length;
    setText(
      p.meta,
      count
        ? count + (count === 1 ? " file · " : " files · ") +
          formatSize(group.files.reduce((sum, f) => sum + f.bytes, 0))
        : "Empty"
    );

    p.ctl.style.display = isFolder ? "" : "none";
    if (isFolder) {
      p.chip.style.background = colourHex(group.color);
      p.swatch.setAttribute("aria-label", "Change colour of " + group.name);
      p.up.setAttribute("aria-label", "Move " + group.name + " up");
      p.down.setAttribute("aria-label", "Move " + group.name + " down");
      const confirming = pendingDelete === group.id;
      setData(p.trash, "confirm", confirming ? "1" : null);
      p.trash.setAttribute(
        "aria-label",
        (confirming ? "Confirm deleting " : "Delete ") + group.name
      );
    }

    if (editingId === group.id && node.dataset.editing !== "1") {
      beginRename(node);
    }
  }

  function beginRename(node) {
    const folder = folderById(node.dataset.folder);
    if (!folder) return; // Unfiled cannot be renamed
    editingId = folder.id;
    node.dataset.editing = "1";
    node._parts.edit.value = folder.name;
    node._parts.edit.focus();
    node._parts.edit.select();
  }

  function commitRename(node) {
    const folder = folderById(node.dataset.folder);
    editingId = null;
    delete node.dataset.editing;
    if (!folder) return;
    const next = node._parts.edit.value.trim();
    if (!next || next === folder.name) return;
    folder.name = next;
    saveState();
    invalidate();
  }

  /* ----------------------------------------------------------- rendering */

  function groupsFor(files) {
    const counts = new Map();
    for (const f of files) counts.set(f.name, (counts.get(f.name) || 0) + 1);

    const groups = state.folders
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((f) => ({
        id: f.id,
        name: f.name,
        color: f.color,
        collapsed: !!f.collapsed,
        files: [],
      }));
    const byId = new Map(groups.map((g) => [g.id, g]));
    const unfiled = {
      id: UNFILED,
      name: "Unfiled",
      color: null,
      collapsed: false,
      files: [],
    };

    for (const f of files) {
      f.duplicate = counts.get(f.name) > 1;
      const assigned = state.items[f.name];
      const target = assigned && byId.get(assigned.f);
      (target || unfiled).files.push(f);
    }
    groups.push(unfiled);
    return groups;
  }

  function render() {
    if (!grid || !grid.isConnected) {
      grid = findGrid();
      if (!grid) return teardownView();
    }
    ensureBar();
    ensureNewFolderButton();

    /* ---- reads ---- */
    const all = readCards();
    const files = all.filter((f) => !f.nativeHidden);

    if (!all.length) {
      if (!grid.querySelector('[data-testid="file-thumbnail"]')) root.hidden = true;
      return;
    }
    if (root.hidden) root.hidden = false;
    selectedCount = files.filter((f) => f.checked).length;
    tokens = sampleTokens();

    const stripped = files.some((f) => f.wrapper.dataset.scO === undefined);
    const sig = [
      files.map((f) => f.name + (f.checked ? "\u0001" : "")).join("\u0000"),
      state.folders
        .map((f) => f.id + ":" + f.name + ":" + f.color + ":" + (f.collapsed ? 1 : 0))
        .join(","),
      Object.entries(state.items)
        .map(([k, v]) => k + ">" + v.f)
        .join(","),
      String(pendingDelete),
      tokenSignature(),
    ].join("\u0002");

    if (!stripped && sig === lastSig) return;
    lastSig = sig;

    /* ---- writes ---- */
    applying = true;
    applyTokens(root);

    const groups = groupsFor(files);
    const showHeaders = state.folders.length > 0;
    let order = 0;
    let headerIndex = 0;

    for (const group of groups) {
      const skip = group.id === UNFILED && !group.files.length;
      if (showHeaders && !skip) {
        const node = headerNode(headerIndex++);
        paintHeader(node, group);
        setData(node, "scO", Math.min(order++, MAX_ORDER));
        if (node.parentElement !== grid) grid.appendChild(node);
        if (node.hidden) node.hidden = false;
      }

      for (const f of group.files) {
        const w = f.wrapper;
        setData(w, "scHide", group.collapsed ? "1" : null);
        setData(w, "scC", group.color || null);
        setData(w, "scDup", f.duplicate ? "1" : null);
        setData(w, "scO", Math.min(order++, MAX_ORDER));
      }
    }

    for (let i = headerIndex; i < headerPool.length; i++) {
      const node = headerPool[i];
      if (node && !node.hidden) node.hidden = true;
    }

    renderMoveAffordance();

    applying = false;
    if (gridObserver) gridObserver.takeRecords();
  }

  function renderMoveAffordance() {
    const injected = ensureMoveButton();
    const showFallback = selectedCount > 0 && !injected;
    if (els.fallback.hidden === showFallback) els.fallback.hidden = !showFallback;
    if (!showFallback) {
      lastMoveSig = "";
      return;
    }

    setText(
      els.fallbackCount,
      selectedCount + (selectedCount === 1 ? " file selected" : " files selected")
    );
    const moveSig = state.folders.map((f) => f.id + ":" + f.name).join(",");
    if (moveSig === lastMoveSig || document.activeElement === els.fallbackSelect) {
      return;
    }
    lastMoveSig = moveSig;

    els.fallbackSelect.textContent = "";
    const placeholder = new Option("Move to…", "");
    placeholder.disabled = true;
    placeholder.selected = true;
    els.fallbackSelect.add(placeholder);
    for (const f of state.folders) els.fallbackSelect.add(new Option(f.name, f.id));
    els.fallbackSelect.add(new Option("Unfiled", UNFILED));
  }

  /* --------------------------------------------------------------- actions */

  function toggleCollapse(id) {
    const folder = folderById(id);
    if (folder) {
      folder.collapsed = !folder.collapsed;
      saveState();
      invalidate();
    }
  }

  function cycleColour(id) {
    const folder = folderById(id);
    if (!folder) return;
    const at = PALETTE.findIndex((p) => p.id === folder.color);
    folder.color = PALETTE[(at + 1) % PALETTE.length].id;
    saveState();
    invalidate();
  }

  function onAddFolder() {
    const folder = {
      id: uid("f_"),
      name: NEW_FOLDER_NAME,
      color: randomColour(),
      order: state.folders.length,
      collapsed: false,
    };
    state.folders.push(folder);
    editingId = folder.id;
    saveState();
    invalidate();
  }

  function onDeleteFolder(id) {
    const folder = folderById(id);
    if (!folder) return;

    if (pendingDelete !== folder.id) {
      pendingDelete = folder.id;
      invalidate();
      setTimeout(() => {
        if (pendingDelete !== folder.id) return;
        pendingDelete = null;
        invalidate();
      }, CONFIRM_MS);
      return;
    }

    pendingDelete = null;
    state.folders = state.folders.filter((f) => f.id !== folder.id);
    state.folders.forEach((f, i) => (f.order = i));
    for (const key of Object.keys(state.items)) {
      if (state.items[key].f === folder.id) delete state.items[key];
    }
    saveState();
    invalidate();
    say("Deleted " + folder.name + ". Its files are unfiled.");
  }

  function reorder(id, delta) {
    const index = state.folders.findIndex((f) => f.id === id);
    if (index < 0) return;
    const next = index + delta;
    if (next < 0 || next >= state.folders.length) return;
    const [moved] = state.folders.splice(index, 1);
    state.folders.splice(next, 0, moved);
    state.folders.forEach((f, i) => (f.order = i));
    saveState();
    invalidate();
  }

  function moveSelectionTo(target) {
    const files = readCards().filter((f) => f.checked && !f.nativeHidden);
    if (!files.length) return;
    for (const f of files) {
      if (target === UNFILED) delete state.items[f.name];
      else state.items[f.name] = { f: target };
    }
    saveState();
    // Clear the app's own selection through its own handler.
    for (const f of files) if (f.checkbox) f.checkbox.click();
    invalidate();
  }

  function onExport() {
    const payload = JSON.stringify(
      { schema: SCHEMA, folders: state.folders, items: state.items },
      null,
      2
    );
    GM_setClipboard(payload, "text");
    els.io.hidden = false;
    els.apply.hidden = true;
    els.io.value = payload;
    say("Copied to the clipboard.");
  }

  function onImport() {
    let parsed;
    try {
      parsed = JSON.parse(els.io.value);
    } catch (err) {
      say("That is not valid JSON.", true);
      return;
    }
    const next = normalise(parsed);
    if (!next.folders.length && !Object.keys(next.items).length) {
      say("No folders or assignments found in that layout.", true);
      return;
    }
    state = next;
    saveState();
    els.io.hidden = true;
    els.apply.hidden = true;
    invalidate();
    say("Layout applied.");
  }

  /* ------------------------------------------------------------ lifecycle */

  function currentProjectId() {
    const m = /\/project\/([0-9a-zA-Z-]{6,})/.exec(location.pathname);
    return m ? m[1] : null;
  }

  function teardownView() {
    closeMoveMenu();
    clearCardAttributes();
    for (const node of headerPool) if (node) node.remove();
    headerPool = [];
    lastSig = lastMoveSig = "";
    editingId = null;
    pendingDelete = null;
    if (root) root.hidden = true;
    for (const btn of [newFolderBtn, moveBtn]) if (btn) btn.remove();
    newFolderBtn = null;
    moveBtn = null;
    if (gridObserver) {
      gridObserver.disconnect();
      gridObserver = null;
    }
    grid = null;
  }

  function observeGrid() {
    if (gridObserver) gridObserver.disconnect();
    gridObserver = new MutationObserver(() => {
      if (!applying) scheduleRender();
    });
    gridObserver.observe(grid, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-checked", "class", "style"],
    });
  }

  function tick() {
    const id = currentProjectId();
    if (id !== projectId) {
      teardownView();
      projectId = id;
      if (projectId) loadState();
    }
    if (!projectId) return;

    const found = findGrid();
    if (!found) {
      if (grid) teardownView();
      return;
    }
    if (found !== grid) {
      grid = found;
      headerPool = [];
      lastSig = lastMoveSig = "";
      observeGrid();
    } else if (!gridObserver) {
      observeGrid();
    }
    scheduleRender();
  }

  function start() {
    themeObserver = new MutationObserver(invalidate);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    // Page-level watcher: route changes, grid replacement and the selection bar
    // appearing outside the grid. The grid's own observer covers the rest.
    let scanTimer = null;
    bodyObserver = new MutationObserver(() => {
      if (scanTimer) return;
      scanTimer = setTimeout(() => {
        scanTimer = null;
        try {
          tick();
        } catch (err) {
          /* fail quietly */
        }
      }, SCAN_MS);
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    tick();
  }

  try {
    start();
  } catch (err) {
    // Fail quietly on a page we do not recognise.
  }
})();