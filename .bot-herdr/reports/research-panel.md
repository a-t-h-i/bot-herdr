# Research Panel Report

## Summary

Yes — ripgrep is already the cross-platform answer ("ripgrep for Unix, native support for Windows" is really the same tool: BurntSushi/ripgrep has native Windows MSVC/GNU/aarch64 binaries). I verified comparable alternatives for file discovery (fd), AST/structural search (ast-grep, tree-sitter) and symbol lookup (Universal Ctags, tree-sitter "tags" queries), all checked for Windows compatibility, licensing and Node bundling options. The mod's classifier does not select search tools — it triages task size/kind only.

## Changes

None — read-only research of the repo (`bh scripts run repo_map`, `bh plan show p-20261121-0b9c`, grep for "classifier"). No files modified.

## Brief Check

- Tools usable with the mod, Unix + Windows:
  - ripgrep — `BurntSushi/ripgrep`; latest release 15.2.0 (published 2026-07-15); Windows assets: ripgrep-15.2.0-{x86_64,i686,aarch64}-pc-windows-msvc.zip and -x86_64-pc-windows-gnu.zip (https://github.com/BurntSushi/ripgrep/releases/tag/15.2.0); license key "unlicense" (repo endpoint). npm bundle: `@vscode/ripgrep` 1.18.0, MIT, published 2026-05-07 (registry.npmjs.org/@vscode/ripgrep), per-platform optional deps @vscode/ripgrep-win32-x64 etc.
  - ugrep — `Genivia/ugrep`; "Cross-platform support – runs on Linux, macOS, and Windows"; ships x86/x64 Windows binaries in releases (ugrep-windows-x64.zip per Scoop bucket manifest); BSD-3. Caveat: needs PCRE2 installed (release notes: "Building ugrep on Windows takes some serious effort to install and compile PCRE2").
  - tree-sitter — `tree-sitter/tree-sitter`; v0.27.2 (published 2026-11-07); MIT; `tree-sitter-cli-windows-x64.zip` etc. in the CLI release (https://github.com/tree-sitter/tree-sitter/releases/tag/v0.27.2); npm: `tree-sitter-cli` (https://npmjs.com/package/tree-sitter-cli), plus `web-tree-sitter` (WASM, runs anywhere).
- Symbol lookup:
  - Universal Ctags — `universal-ctags/ctags`; v6.2.1 (published 2025-10-25); license GPL-2.0 (repo endpoint); official release is a source tarball — no official prebuilt Windows binaries; Windows builds are community/MinGW/MSYS2 builds.
  - tree-sitter — "tags" queries per grammar: grammar-based symbol discovery, works cross-platform (see above).
- AST/structural search:
  - ast-grep — `ast-grep/ast-grep`; 0.51.3 (published 2026-11-16); MIT; Windows assets app-{x86_64,aarch64,i686}-pc-windows-msvc.zip (https://github.com/ast-grep/ast-grep/releases/tag/0.51.3); npm: `@ast-grep/cli` (https://npmjs.com/package/@ast-grep/cli), binary packages e.g. @ast-grep/cli-win32-x64-msvc, requires Node.js 20+.
- File discovery (Unix alternatives to find):
  - fd — `sharkdp/fd` ("A simple, fast and user-friendly alternative to 'find'"); v10.5.2 (published 2026-11-07); Apache-2.0; Windows assets fd-v10.5.2-{x86_64,i686,aarch64}-pc-windows-msvc.zip and -gnullvm variant (https://github.com/sharkdp/fd/releases/tag/v10.5.2); npm: `fd-find` (https://npmjs.com/package/fd-find, pablopunk — downloads official fd releases).
  - `rg --files` — file listing is built into ripgrep (cross-platform).
- Fallbacks: git grep (internal search, cross-platform); GNU grep + GNU find on Unix; on Windows: `findstr` (cmd), PowerShell `Select-String` (grep equivalent) + `Get-ChildItem`; Unix tools on Windows via WSL/MSYS2/Cygwin; cscope (C-focused, less maintained).

## Classifier answer

The mod's classifier (`mods/bot-herdr/engine/classifier/index.mjs`) does not select or triage tools by type: `triageByRules` (line 196) and `triage` (line 248) classify task size/kind ("trivial/small/medium/...", lines 175-177, 231-246); `triageQuestions` (line 215) asks whether one engineer could do it alone and about areas touched — used for track selection, not tool choice. Tool selection is by the human/plan (see Key Questions).

## Key Questions (for the plan)

1. Adopt ripgrep as the mod's core reader (rg --json for retrieval, --files/--type/--glob/-A/-B/-C/--replace) or a stack of fd + ast-grep + ctags/tree-sitter?
2. Node bundling: `@vscode/ripgrep` npm (MIT, per-platform optional deps) vs vendoring microsoft/ripgrep-prebuilt release binaries vs manual GitHub releases?
3. Symbol lookup: ctags (GPL-2.0 — restrictive; no official Windows binaries) vs tree-sitter tags, or both?
4. AST search: `@ast-grep/cli` npm (MIT; Node 20+; postinstall binary packaging) vs `tree-sitter-cli` npm, or both (ast-grep = rule-based, tree-sitter = grammar-based)?
5. ugrep (BSD-3, ships Windows binaries, adds PCRE2 dependency) — include or not?
6. Windows-native fallbacks to standardize: findstr / PowerShell Select-String / fd on Windows; git grep, MSYS2, WSL on Unix.

## Verification

- `bh scripts run repo_map` — 903 files; mods/bot-herdr present; no existing rg/fd/ast-grep wiring in the mod found.
- `bh plan show p-20261121-0b9c` — plan p-20261121-0b9c, "grilling round 0 Improve code reading and retrieval for...", no draft yet.
- `grep -rli "classifier" --exclude-dir=node_modules --exclude-dir=.git .` — found mods/bot-herdr/engine/classifier/index.mjs and classifier tests.
- `webfetch https://api.github.com/repos/BurntSushi/ripgrep` — license.key "unlicense"; Rust; release 15.2.0.
- `webfetch https://api.github.com/repos/BurntSushi/ripgrep/releases/latest` — tag 15.2.0, published_at 2026-07-15; Windows assets x86_64/i686/aarch64-pc-windows-msvc, x86_64-pc-windows-gnu.
- `webfetch https://registry.npmjs.org/@vscode/ripgrep` — 1.18.0, published 2026-05-07, license MIT, optional deps @vscode/ripgrep-win32-x64 etc.
- `webfetch https://api.github.com/repos/sharkdp/fd/releases/latest` — v10.5.2, published 2026-11-07; Windows assets fd-v10.5.2-x86_64-pc-windows-msvc.zip, -i686-, -aarch64-, -gnullvm, -gnu.
- `webfetch https://api.github.com/repos/sharkdp/fd` — license.key apache-2.0.
- `webfetch https://api.github.com/repos/ast-grep/ast-grep/releases/latest` — 0.51.3, published 2026-11-16; Windows assets app-x86_64-pc-windows-msvc.zip, app-aarch64-, app-i686-.
- `webfetch https://api.github.com/repos/ast-grep/ast-grep` — license.key mit.
- `webfetch https://api.github.com/repos/universal-ctags/ctags/releases/latest` — v6.2.1, published 2025-10-25; single asset universal-ctags-6.2.1.tar.gz.
- `webfetch https://api.github.com/repos/universal-ctags/ctags` — license.key gpl-2.0.
- `webfetch https://api.github.com/repos/tree-sitter/tree-sitter/releases/latest` — v0.27.2, published 2026-11-07; assets tree-sitter-cli-windows-x64.zip, -arm64, -x86; tree-sitter-cli-windows-x64.zip; web-tree-sitter.tar.gz.
- `webfetch https://api.github.com/repos/tree-sitter/tree-sitter` — license MIT.
- `websearch "ugrep GitHub repository license cross-platform Windows"` — Genivia/ugrep; cross-platform Linux/macOS/Windows; Windows binaries in releases; BSD-3.
- `websearch "fd-find npm package name"` — fd-find (pablopunk) downloads official fd releases.
- `websearch "@ast-grep/cli npm package"` — npmjs.com/package/@ast-grep/cli; Node 20+; binary packages @ast-grep/cli-win32-x64-msvc.
- `websearch "tree-sitter-cli npm package web-tree-sitter"` — npmjs.com/package/tree-sitter-cli; web-tree-sitter.
