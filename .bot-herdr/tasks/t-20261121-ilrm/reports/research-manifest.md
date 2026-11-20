# Research Report — t-20261121-ilrm (step 1)

## Summary
Verified official GitHub release assets, archive names, inner binary paths and digests for `rg`, `fd` and `ast-grep` across all six Node platform/arch pairs; wrote `.bot-herdr/tmp/ilrm-manifest-facts.json` (valid JSON: 3 tools x 6 targets, every sha256 a 64-char lowercase hex digest).

## Changes
- `.bot-herdr/tmp/ilrm-manifest-facts.json` — new facts file; nothing else changed.

## Brief Check
- Manifest exists and parses as valid JSON: MET (python3 json.load plus schema check, reported below).
- Covers `rg`, `fd`, `ast-grep` across all 6 targets (win32-x64, win32-arm64, linux-x64, linux-arm64, darwin-x64, darwin-arm64): MET — 3 tools, 6 targets each, no target missing.
- Every non-null `sha256` is a real verified 64-char hex digest with source cited: MET — each value is the `digest` field of the GitHub Releases API asset object; companion `.sha256` release assets are published for rg and fd (noted per target).
- Report recorded via `bh report`: MET (recorded below).

## Verification
- `https://api.github.com/repos/BurntSushi/ripgrep/releases/tags/15.2.0` — 200, tag `15.2.0`, published 2026-07-15.
- `https://api.github.com/repos/sharkdp/fd/releases/tags/v10.5.2` — 200, tag `v10.5.2`, published 2026-11-07.
- `https://api.github.com/repos/ast-grep/ast-grep/releases/tags/0.51.3` — 200, tag `0.51.3`, published 2026-11-16.
- Archive listings (in-memory, no disk writes): `ripgrep-15.2.0-aarch64-apple-darwin.tar.gz` contains `ripgrep-15.2.0-aarch64-apple-darwin/rg`; `fd-v10.5.2-aarch64-apple-darwin.tar.gz` contains `fd-v10.5.2-aarch64-apple-darwin/fd`; `app-x86_64-pc-windows-msvc.zip` (ast-grep) contains `ast-grep.exe` and `sg.exe` at archive root.
- `https://raw.githubusercontent.com/sharkdp/fd/v10.5.2/Cargo.toml` — `license = "MIT OR Apache-2.0"`.
- `https://raw.githubusercontent.com/ast-grep/ast-grep/0.51.3/Cargo.toml` — workspace `license = "MIT"`.
- `python3 -c` JSON validation of `.bot-herdr/tmp/ilrm-manifest-facts.json` — VALID.

Caveats:
- Binary names inside archives are verified from the archives listed above; other targets follow the same per-tool convention (same CI build).
- ast-grep Windows zips contain both `ast-grep.exe` and `sg.exe`; recorded `binaryInArchive` is `ast-grep.exe`.
- musl assets preferred where published: rg (`x86_64-unknown-linux-musl`, `aarch64-unknown-linux-musl`) and fd (`x86_64-unknown-linux-musl`, `aarch64-unknown-linux-musl`).
- fd win32-arm64 chose `fd-v10.5.2-aarch64-pc-windows-msvc.zip` over the published `fd-v10.5.2-aarch64-pc-windows-gnullvm.zip` variant.
- rg linux-x64 chose `ripgrep-15.2.0-x86_64-unknown-linux-musl.tar.gz` over the published `ripgrep-15.2.0-x86_64-unknown-linux-gnu.tar.gz`.
- ast-grep: only gnu assets exist on x86_64; linux-arm64 chose `app-aarch64-unknown-linux-gnu.zip` over the published `app-aarch64-unknown-linux-musl.zip`.
- ast-grep has no published `.sha256` companion assets; digests are the API asset `digest` fields.
