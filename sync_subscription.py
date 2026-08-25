#!/usr/bin/env python3
"""
sync_subscription.py

Regenerates the @scriptUrl list in subscription.user.sub.js from the current
contents of scripts/*.user.js, and bumps the subscription's own @version when
the set of scripts changes.

Intended to run locally before a commit (e.g. as a git pre-commit hook, or
invoked manually). It only touches the @scriptUrl lines and the @version line
inside the ==UserSubscribe== block -- nothing else in the file is rewritten.

Usage:
    python3 sync_subscription.py [--repo-root PATH] [--check] [--dry-run]

Exit codes:
    0  nothing to do, or changes were applied successfully
    1  manifest was updated (only relevant with --check, for CI gating)
    2  a script file has a broken/missing header -- fix it before committing
    3  subscription.user.sub.js itself is missing or malformed


===== EXAMPLES ===================
python3 sync_subscription.py                    # scans ./scripts, rewrites ./subscription.user.sub.js
python3 sync_subscription.py --dry-run           # preview only, no write
python3 sync_subscription.py --check             # exit 1 if out of date, no write — good for CI/pre-commit gate

As pre-commit hook, add to .git/hooks/pre-commit:
```
#!/bin/bash
python3 sync_subscription.py --repo-root "$(git rev-parse --show-toplevel)"
git add subscription.user.sub.js
```
"""

import argparse
import re
import sys
from pathlib import Path

REPO = "cizzoo/scriptcat-scripts"
BRANCH = "main"
RAW_BASE = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}"

SCRIPT_URL_RE = re.compile(r"^\s*//\s*@scriptUrl\s+(\S+)\s*$", re.MULTILINE)
VERSION_RE = re.compile(r"^(\s*//\s*@version\s+)(\S+)(\s*)$", re.MULTILINE)
NAME_RE = re.compile(r"^\s*//\s*@name\s+(.+?)\s*$", re.MULTILINE)
UGH_START_RE = re.compile(r"==UserScript==")
SUB_START_RE = re.compile(r"==UserSubscribe==")
SUB_END_RE = re.compile(r"==/UserSubscribe==")


def die(message: str, code: int) -> None:
    print(f"error: {message}", file=sys.stderr)
    sys.exit(code)


def read_script_header(path: Path) -> dict:
    """Extract @name and @version from a userscript's metadata block."""
    text = path.read_text(encoding="utf-8")

    if not UGH_START_RE.search(text):
        die(f"{path.name}: missing ==UserScript== header", 2)

    name_match = NAME_RE.search(text)
    version_match = re.search(r"^\s*//\s*@version\s+(\S+)\s*$", text, re.MULTILINE)

    if not name_match:
        die(f"{path.name}: missing @name in metadata block", 2)
    if not version_match:
        die(f"{path.name}: missing @version in metadata block", 2)

    return {
        "name": name_match.group(1),
        "version": version_match.group(1),
        "filename": path.name,
        "url": f"{RAW_BASE}/scripts/{path.name}",
    }


def bump_patch(version: str) -> str:
    parts = version.split(".")
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        die(
            f"subscription.user.sub.js: @version '{version}' is not MAJOR.MINOR.PATCH, "
            "cannot auto-bump. Fix it manually.",
            3,
        )
    major, minor, patch = parts
    return f"{major}.{minor}.{int(patch) + 1}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path.cwd(),
        help="Path to the repo root (directory containing scripts/ and subscription.user.sub.js)",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Don't write anything; exit 1 if the manifest is out of date (for CI).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the diff that would be applied without writing the file.",
    )
    args = parser.parse_args()

    root = args.repo_root
    scripts_dir = root / "scripts"
    sub_path = root / "subscription.user.sub.js"

    if not scripts_dir.is_dir():
        die(f"no scripts/ directory found at {scripts_dir}", 3)
    if not sub_path.is_file():
        die(f"no subscription.user.sub.js found at {sub_path}", 3)

    script_files = sorted(
        p
        for p in scripts_dir.glob("*.user.js")
        if p.name != "_template.user.js"
    )

    if not script_files:
        print("warning: no scripts found in scripts/ (besides _template.user.js)")

    headers = [read_script_header(p) for p in script_files]
    target_urls = [h["url"] for h in headers]

    sub_text = sub_path.read_text(encoding="utf-8")

    if not SUB_START_RE.search(sub_text) or not SUB_END_RE.search(sub_text):
        die("subscription.user.sub.js: missing ==UserSubscribe== block", 3)

    current_urls = SCRIPT_URL_RE.findall(sub_text)
    current_set = set(current_urls)
    target_set = set(target_urls)

    added = sorted(target_set - current_set)
    removed = sorted(current_set - target_set)

    if not added and not removed:
        print("subscription.user.sub.js is already up to date. No changes.")
        sys.exit(0)

    if removed:
        print("WARNING: the following @scriptUrl entries will be REMOVED.")
        print("Removing a @scriptUrl UNINSTALLS that script on every subscribed device:")
        for url in removed:
            print(f"  - {url}")
    if added:
        print("The following @scriptUrl entries will be ADDED:")
        for url in added:
            print(f"  + {url}")

    if args.check:
        print("\n--check: manifest is out of date.")
        sys.exit(1)

    # Rebuild the @scriptUrl block, alphabetical by filename, preserving indentation
    # style of the first existing @scriptUrl line if present, else default "// @scriptUrl ".
    indent_match = re.search(r"^(\s*//\s*@scriptUrl\s+)", sub_text, re.MULTILINE)
    prefix = indent_match.group(1) if indent_match else "// @scriptUrl "

    new_lines_block = "\n".join(f"{prefix}{url}" for url in target_urls)

    # Replace the existing contiguous run of @scriptUrl lines. If there were none
    # (empty manifest), insert the block right after ==UserSubscribe==.
    if current_urls:
        # Remove all existing @scriptUrl lines, then splice the new block in at
        # the position of the first one.
        first_match = SCRIPT_URL_RE.search(sub_text)
        first_pos = first_match.start()

        # Strip every @scriptUrl line (each is matched with its own newline).
        stripped = re.sub(r"^\s*//\s*@scriptUrl\s+\S+\s*\n?", "", sub_text, flags=re.MULTILINE)

        # Recompute insertion point in the stripped text: it's wherever the run
        # of @scriptUrl lines used to start, adjusted for removed text before it.
        # Simplest robust approach: insert right after the last metadata line
        # before where @scriptUrl used to begin. We do this by re-splitting on
        # the UserSubscribe end marker and inserting just before it if unsure.
        before_block = sub_text[:first_pos]
        after_first_run = sub_text[first_pos:]
        # Skip past the contiguous run of @scriptUrl lines (and blank lines directly after).
        after_block = re.sub(r"^(\s*//\s*@scriptUrl\s+\S+\s*\n)+", "", after_first_run)

        new_sub_text = before_block + new_lines_block + "\n" + after_block
    else:
        insert_at = SUB_START_RE.search(sub_text).end()
        line_end = sub_text.index("\n", insert_at) + 1
        new_sub_text = (
            sub_text[:line_end] + new_lines_block + "\n" + sub_text[line_end:]
        )

    version_match = VERSION_RE.search(new_sub_text)
    if not version_match:
        die("subscription.user.sub.js: missing @version in ==UserSubscribe== block", 3)

    old_version = version_match.group(2)
    new_version = bump_patch(old_version)
    new_sub_text = VERSION_RE.sub(
        lambda m: f"{m.group(1)}{new_version}{m.group(3)}", new_sub_text, count=1
    )

    print(f"\nsubscription @version: {old_version} -> {new_version}")

    if args.dry_run:
        print("\n--dry-run: not writing file. Preview of new @scriptUrl block:")
        print(new_lines_block)
        sys.exit(0)

    sub_path.write_text(new_sub_text, encoding="utf-8")
    print(f"\nWrote {sub_path}")
    print("Remember to commit and push -- that's what triggers sync to your devices.")
    if removed:
        print(
            "\nReminder: removed script(s) above will be uninstalled on every "
            "subscribed device once this is pushed."
        )


if __name__ == "__main__":
    main()
