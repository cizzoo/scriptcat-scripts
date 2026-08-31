# AGENT.md — working rules for AI agents in `cizzoo/scriptcat-scripts`

Instructions for any AI coding agent (Claude Code, Cursor, Copilot, etc.) operating on this
repo. Human-facing setup and sync docs live in `README.md`; visual conventions for
claude.ai panels live in `docs/claude-ai-style-spec.md`. This file is the behavioural
contract: read it before touching anything.

---

## 0. What this repo is

A personal collection of [ScriptCat](https://docs.scriptcat.org/en/docs/dev) userscripts,
version-controlled in git and distributed to every device through ScriptCat's
**Subscription Mode**. Git is the source of truth. A change only reaches the user's devices
after `@version` is bumped, committed, and pushed.

The user is competent with JavaScript. Be direct, skip introductory explanations, and point
out bugs, footguns, and better approaches instead of silently implementing the literal
request.

---

## 1. This repo is public — hard security rules

The repo must be public so `raw.githubusercontent.com` can serve files to ScriptCat without
auth. Everything written here is permanently public, **including old commits**.

Never write into a script, comment, doc, or commit message:

- API keys, tokens, client secrets, webhook URLs, passwords, session cookies, auth headers
- Personal data beyond what a `@match` pattern or selector genuinely requires
- Internal or company-specific URLs, hostnames, or infrastructure details

Where such values belong instead:

- **Per-device runtime values** → `GM_setValue` / `GM_getValue`, entered locally once via a
  prompt or the ScriptCat dashboard storage editor.
- **Selectors or URLs that reveal a private tool** → keep the script generic and inject the
  specifics via `GM_getValue`.

Agent obligations:

- If a value the user supplies looks like a credential or personal data, **stop and flag it**
  before putting it in a file. Do not include it silently.
- If something sensitive has already been committed, say so explicitly and tell the user to
  rotate/revoke it immediately. A revert or force-push does **not** remove it from GitHub's
  history, caches, forks, or anyone who already pulled. Treat it as burned.
- Scan the diff for the categories above before proposing a commit.

---

## 2. Repo layout

```
scriptcat-scripts/
├── AGENT.md
├── README.md
├── subscription.user.sub.js   <- the single link installed on every device
├── sync_subscription.py       <- regenerates the subscription manifest from scripts/
├── scripts/                   <- one subfolder per target site, one file per userscript
│   ├── _template.user.js
│   ├── claude/
│   ├── google/
│   └── example/
├── lib/                       <- shared code loaded via @require (dom-helpers.js, ...)
├── docs/                      <- per-script notes, changelogs, style specs
└── hooks/                     <- optional pre-commit hook
```

New scripts start from `scripts/_template.user.js` and go in the per-site subfolder
(`scripts/claude/` for claude.ai, etc.). Create the folder if the site is new.

Canonical raw URL pattern for every `@updateURL`, `@downloadURL`, `@scriptUrl`, and
`@require`:

```
https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/<path>
```

Never emit a `USERNAME/REPO` placeholder. Use `main` unless explicitly testing a branch.

---

## 3. Distribution model

- `subscription.user.sub.js` uses a `==UserSubscribe==` block listing every script under
  `@scriptUrl`. The user installs only this link per device; ScriptCat then installs,
  updates, and removes scripts silently as the manifest changes.
- Subscription links must be `https` and end in `user.sub.js`.
- **Removing a `@scriptUrl` uninstalls that script on every device.** Always flag this when
  proposing a removal.
- Scripts installed via subscription inherit the **subscription's** `@connect`, not their
  own. Any host needed for `GM_xmlhttpRequest`, `GM_cookie`, or native `GM_download` must be
  declared in the subscription manifest too.
- `python3 sync_subscription.py` rescans `scripts/` and rewrites the manifest; it can run as
  a pre-commit hook (`git config core.hooksPath hooks`).
- ScriptCat's built-in cloud sync is an optional secondary backup mirroring installed
  scripts. It does not replace the git flow.

---

## 4. Metadata rules (non-negotiable)

Every script gets a complete `==UserScript==` block with:

- `@name`, `@namespace`, `@version`, `@description`, `@author`
- **`@namespace` is always the literal repo root:**
  `https://github.com/cizzoo/scriptcat-scripts` — identical in every script, never a
  per-file URL. `@namespace` + `@name` are the script's identity. A per-file namespace still
  runs, but breaks the convention, and if a script is later reinstalled from a different URL
  it can install as a **duplicate** instead of updating in place. Check this explicitly on
  every new script: the dashboard editor autogenerates a namespace (random ID or
  ScriptCat-hosted URL) that must be overwritten.
- `@match` in Chrome match-pattern syntax; prefer `@match` over `@include`, use `@exclude`
  for carve-outs
- `@grant` for every GM API used. An ungranted API is unavailable. `@grant none` runs in the
  page with no GM APIs at all.
- `@updateURL` **and** `@downloadURL`, both raw GitHub URLs. `@updateURL` does nothing
  without `@downloadURL`.
- `@run-at`: one of `document-start`, `document-end`, `document-idle`, `document-body`.
  **Never `document-menu`** (removed after v0.9.4).

Reach for when relevant: `@require` / `@require-css`, `@resource` +
`GM_getResourceText`/`GM_getResourceURL`, `@noframes`, `@inject-into` (`page` default, or
`content` to escape CSP at the cost of page-`window` access), `@storageName` to share
`GM_*Value` storage between scripts, `@early-start` with `@run-at document-start`,
`@definition` for editor typings.

For third-party CDN `@require`/`@resource`: pin the version (never a mutable "latest") and
add a subresource integrity hash (`#sha384-...` or stronger).

---

## 5. Versioning

- Semver `MAJOR.MINOR.PATCH`. Patch for fixes, minor for features, major for breaking
  changes (renamed `@match`, changed stored-value schema, changed `@grant` set).
- **Always bump `@version` when changing a script.** An unbumped script does not propagate.
- Bump the subscription's own `@version` when adding or removing a `@scriptUrl`.
- After finishing an edit, **state the new version number explicitly** so the user can
  confirm it.

---

## 6. Code conventions

- All code, comments, identifiers, and commit messages in **English**.
- Wrap script bodies in an IIFE with `"use strict"`.
- Prefer `GM_addStyle` / CSS injection for hiding or restyling page elements over JS DOM
  removal — it survives re-renders and doesn't fight the page's own scripts.
- Assume targets are SPAs: make setup idempotent (guard on an element id before inserting)
  and re-assert via `MutationObserver` rather than a single run on load. Disconnect
  observers on teardown.
- Use `lib/dom-helpers.js` (`waitForElement`, `onDomChange`, `insertOnce`) instead of
  re-deriving those patterns per script; extend the lib when a pattern recurs.
- Namespace injected DOM ids and CSS classes as `sc-<script>-<thing>`, off a single `NS`
  const.
- Prefer stable selectors (`data-*`, ARIA roles, semantic structure) over generated/hashed
  class names, and comment which selectors are likely to break.
- Fail quietly on an unrecognised page. Never throw uncaught errors into the page console.
- For any UI injected into `https://claude.ai/*`, follow `docs/claude-ai-style-spec.md`
  (tokens, theme resolution, geometry, dock pattern, accessibility). Do not invent a new
  visual language per script.

---

## 7. ScriptCat-specific gotchas

ScriptCat is Tampermonkey-compatible but **not** identical. Verify behaviour against the
docs rather than assuming Tampermonkey semantics.

- `GM_setValue(key, undefined)` **deletes** the key (Tampermonkey stores it). Use `null` to
  store an explicit empty.
- `GM_*Value` is async under the hood. Use `await GM.setValue(...)` when the write must land
  before something else happens (e.g. closing a tab).
- `GM_xmlhttpRequest`, `GM_cookie`, and native-mode `GM_download` require `@connect` for the
  target host; undeclared hosts prompt the user.
- No `@inject-into auto` — choose `page` or `content` deliberately.
- In the `content` environment, `unsafeWindow` is the content-script `window`, not the page's.
- Background (`@background`) and scheduled (`@crontab`) scripts run with no page DOM and
  cannot use tab-scoped APIs like `GM_getTab` / `GM_saveTab`.
- Only one `@crontab` expression per script.

### Authoritative sources

If a claim about ScriptCat behaviour is load-bearing and you are not certain, **search or
fetch the docs before writing code. Do not invent GM APIs.**

- Developer guide — https://docs.scriptcat.org/en/docs/dev
- Metadata block — https://docs.scriptcat.org/en/docs/dev/meta/
- GM API reference — https://docs.scriptcat.org/en/docs/dev/api/
- ScriptCat-only CatApi — https://docs.scriptcat.org/en/docs/dev/cat-api/
- Background & scheduled scripts — https://docs.scriptcat.org/en/docs/dev/background/
- Subscription mode — https://docs.scriptcat.org/en/docs/dev/subscribe/
- UserConfig — https://docs.scriptcat.org/en/docs/dev/config/
- Sync & backup — https://docs.scriptcat.org/en/docs/use/sync/
- Example scripts — https://github.com/scriptscat/scriptcat/tree/main/example

---

## 8. Workflow expectations

- When the user names a new target site, ask for the specific behaviour wanted, and if
  selectors matter, **ask for pasted HTML rather than guessing at class names**.
- Deliver each script as a **complete file** droppable into `scripts/<site>/`, not a diff
  fragment, unless a patch to an existing file is requested.
- When adding a script, also give the exact `@scriptUrl` line for
  `subscription.user.sub.js`.
- Suggest a short `docs/<script>.md` note when a script has non-obvious behaviour,
  site-specific assumptions, or fragile selectors.
- Remind the user to commit and push — that is what actually triggers sync.

### Adding a new script — checklist

1. Copy `scripts/_template.user.js` to `scripts/<site>/<name>.user.js`.
2. Fill metadata: `@name`, `@namespace` (repo root), `@match`, `@version` starting at
   `0.1.0`, `@grant` set, `@run-at`, `@updateURL` + `@downloadURL`.
3. Add the `@scriptUrl` line to `subscription.user.sub.js` (or run
   `sync_subscription.py`) and bump the subscription `@version`.
4. Review the diff for anything sensitive per §1.
5. Commit and push.

### Promoting a dashboard-prototyped script into the repo

When the user has written and tested a script directly in the ScriptCat dashboard and wants
it moved into git, before finalizing the file:

1. Check the exported `@namespace` — the dashboard editor often autogenerates one that isn't
   `https://github.com/cizzoo/scriptcat-scripts`. Overwrite it.
2. Scan for anything sensitive picked up while testing (tokens, cookies, internal URLs) per §1.
3. Trim `@grant` to only what is actually used.
4. Add the `@updateURL` / `@downloadURL` pair.
5. **Tell the user explicitly** to delete the manually-installed dashboard copy (or confirm
   the namespace matches) before the subscription installs the git version, so it updates in
   place instead of appearing as a duplicate.
