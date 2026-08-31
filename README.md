# ScriptCat Scripts — Personal Automation Toolkit

Personal collection of [ScriptCat](https://docs.scriptcat.org/en/docs/dev) userscripts,
synced across devices via git + ScriptCat's **Subscription Mode**.

## ⚠️ This repo is public — never commit sensitive information

This repo must be public for `raw.githubusercontent.com` to serve files to ScriptCat
without authentication (see rationale below). That means **anything committed here is
visible to anyone, forever** — including in old commits after you "remove" it later.

Never put any of the following directly in a script or commit:

- API keys, tokens, client secrets, webhook URLs
- Passwords, session cookies, auth headers
- Personal data (real name, address, phone, private account IDs) beyond what's needed
  for a `@match` pattern
- Internal/company URLs or infrastructure details
- Anything you wouldn't want indexed by search engines or scraped by bots (GitHub is
  scraped constantly and aggressively — secrets committed even briefly get harvested
  within minutes)

Where that kind of data legitimately needs to live:

- **Per-device runtime values** (API keys you personally use, tokens, etc.) → store them
  with `GM_setValue` / `GM_getValue` at runtime, entered once via a prompt or the
  ScriptCat dashboard's storage editor. They stay local to that device (or synced only
  through your private ScriptCat cloud sync, not through git).
- **Site selectors / URLs that reveal a private/internal tool** → keep the script generic
  and inject the specifics via `GM_getValue` instead of hardcoding them.

If you ever commit something sensitive by mistake: rotate/revoke the credential
immediately — a `git revert` or force-push does **not** remove it from GitHub's caches,
forks, or anyone who already pulled it. Treat any committed secret as burned.

## How sync works

1. Every script lives in `scripts/<vendor>/<name>.user.js` (one subfolder per target site),
   each with a proper `==UserScript==` header.
2. `subscription.user.sub.js` (repo root) is a `==UserSubscribe==` manifest that lists
   every script's raw GitHub URL under `@scriptUrl`.
3. On **each device**, you install ONLY the subscription link (see below). ScriptCat then
   silently installs/updates/removes scripts as the subscription file changes.
4. To ship an update: bump `@version` in the script, commit, push. Every device picks it
   up automatically on ScriptCat's next update check (or immediately via "Check for updates"
   in the dashboard).

Optional extra safety net: also enable ScriptCat's built-in cloud sync (Settings →
Synchronization, e.g. Google Drive) as a secondary backup layer. It mirrors whatever is
installed locally, so it doesn't conflict with the git-based subscription flow above.

## Repo layout

```
scriptcat-scripts/
├── README.md
├── subscription.user.sub.js   <- install THIS link on every device
├── scripts/                   <- one subfolder per target site, one file per userscript
│   ├── _template.user.js
│   ├── claude/
│   │   ├── claude-project-switcher.user.js
│   │   └── claude-usage-widget.user.js
│   ├── google/
│   │   └── google-account-switcher.user.js
│   └── example/
│       └── example-ui-tweaks.user.js
├── lib/                       <- shared code loaded via @require
└── docs/                      <- per-script notes, changelogs
```

## One-time setup (per device)

1. Install ScriptCat extension (Chrome / Edge / Firefox).
2. Open this URL in the browser — ScriptCat intercepts `.sub.js` links automatically:
   https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/subscription.user.sub.js
3. Confirm the install dialog. Done — all scripts in the subscription are now installed
   and will update silently going forward.

## Adding a new script

1. Copy `scripts/_template.user.js` to `scripts/<site>/<name>.user.js` (e.g. `scripts/claude/`
   for claude.ai, `scripts/google/` for google.com — create the folder if the site is new).
2. Fill in metadata: `@name`, `@namespace`, `@match`, `@version` (start at `0.1.0`), `@updateURL`, `@downloadURL`.
3. Add a `@scriptUrl` line for it inside `subscription.user.sub.js`. Read more in [Update the subscription file automatically](#update-the-subscription-file-automatically).
4. Before committing: check the diff for anything sensitive (keys, tokens, cookies,
   internal URLs) — see the warning above. Once pushed, treat it as public forever.
5. Commit and push.

### Update the subscription file automatically

You can run `python3 sync_subscription.py` to scan `scripts/` and rewrite `subscription.user.sub.js` automatically. See the script's docstring for usage.
Or add it as a pre-commit hook to keep the subscription file in sync automatically, read more in [Git Repo → Hooks](#hooks).

## Versioning convention

- Follow [semver](https://semver.org/): `MAJOR.MINOR.PATCH`.
- Bump `PATCH` for tweaks/fixes, `MINOR` for new features, `MAJOR` for breaking changes
  (e.g. renamed `@match`, changed storage schema).
- Always bump `@version` when pushing — ScriptCat's update check relies on it.

## GitHub raw URL pattern

```
https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/<path>
```

Use `main` (or your default branch) unless you're testing on a feature branch.

# Git Repo

## Hooks

For convenience, you can add a pre-commit hook to automatically update the subscription file whenever scripts change. See `sync_subscription.py` for details.

You'll find a sample pre-commit hook below. Make sure to give it execute permissions:
```bash
chmod +x hooks/pre-commit
```

And then set up the hook in your local git repo:
```bash
git config core.hooksPath hooks
```