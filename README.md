# ScriptCat Scripts — Personal Automation Toolkit

Personal collection of [ScriptCat](https://docs.scriptcat.org/en/docs/dev) userscripts,
synced across devices via git + ScriptCat's **Subscription Mode**.

## How sync works

1. Every script lives in `scripts/*.user.js`, each with a proper `==UserScript==` header.
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
├── scripts/                   <- one file per userscript
│   └── example-ui-tweaks.user.js
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

1. Copy `scripts/_template.user.js` to `scripts/<name>.user.js`.
2. Fill in metadata: `@name`, `@namespace`, `@match`, `@version` (start at `0.1.0`), `@updateURL`, `@downloadURL`.
3. Add a `@scriptUrl` line for it inside `subscription.user.sub.js`.
4. Commit and push.

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
