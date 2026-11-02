# Large-project startup investigation (0.4.2)

Measured on Windows x64, 2026-11-02, using VS Code 1.143.0's `Code.exe`
with `ELECTRON_RUN_AS_NODE=1`, matching the extension launch path.
Baseline: commit `a3f7fa7` (0.4.1). These are local observations, not performance guarantees.

## Findings

The CLI waited for the entire initial scan before listening or printing its URL.
The extension allowed only 12 seconds for that URL. HTTP handlers also waited
for analysis before serving HTML, preventing a useful loading screen.

Separately, the JS/TS parser kept every TypeScript AST and built a whole-program
checker inside a worker limited to 768 MiB. A 3,000-file fixture exhausted that
heap before startup. The original extension did not reject early process exits
and reported the generic startup timeout instead.

The launcher also decoded individual stdout chunks independently, did not kill
timed-out children, did not share pending launches, and reused one root's server
for requests to open another root.

## Reproduction and verification

Cloned `django/django` with `--depth 1 --single-branch` into an ignored temporary
folder. Revision: `6b212c29e7dfa94f92110d5be034033f449a0cf2`.
The clone contained 7,085 tracked files; CodeCity scanned 3,509 source files.

| Measurement | 0.4.1 | 0.4.2 |
| --- | ---: | ---: |
| Django: URL announced | 39.368 s | 0.136 s |
| Django: HTML available | 39.408 s | 0.210 s |
| Django: model available | 39.648 s | 38.086 s |
| 3,000 JS files: model | worker OOM at 9.336 s | success at 5.078 s |
| Original/fixed extension launch, 3,000 JS files | timeout at 12.022 s | URL at 0.132 s |
| 20,000 JS files: HTML / model | not repeated | 0.687 s / 32.638 s |

The first two Django runs overlapped and included cold disk reads. A subsequent
warm scan took 6.323 s. The fix separates startup from scanning; it does not
promise that disk reads themselves become faster.

Both Django versions produced identical totals: 11,664 buildings, 1,022 districts,
10,839 relationships, 555,888 LOC. Schema validation passed with no duplicate IDs.
A real browser displayed loading and rendered the full city in 8.322 s with no
page errors. Synthetic fixtures repeat CodeCity's own roughly 10 KB parser source;
they measure capacity, not real-world dependency coverage.

The extracted 0.4.2 VSIX was also loaded in the real VS Code 1.143.0 extension
host with separate user-data and extensions directories. The actual Open 3D View
command created the Django tab in 248 ms and a second project's tab in 246 ms.
Both webview tabs existed independently; the isolated test exited successfully.

The test initially attempted a VS Code source clone as well. Its slow partial
transfer was stopped after the completed Django clone and capacity checks supplied
the needed evidence; no complete VS Code-source analysis is claimed here.

## Fix and limits

- Listen and serve static UI before analysis finishes. Data requests still wait
  for a complete model; initial failures are displayed and project controls can
  recover by opening a valid folder.
- Retain full compiler symbol resolution for up to 256 JS/TS source files and
  4 MiB of JS/TS source. Larger projects parse files without retaining ASTs,
  preserving syntax metrics and local module references. Warnings and analysis
  metadata explicitly disclose that compiler call/alias resolution is skipped.
- Release retained AST references after symbol resolution for smaller projects.
- Buffer UTF-8 startup output, include stderr in startup failures, reject early
  exits, clear timers, and kill pending/failed children. The 30-second launch
  timeout now covers server startup rather than the project scan.
- Share pending launches per folder and keep different folders in separate
  server sessions; deactivate closes all sessions.

The worker heap cap remains 768 MiB. Existing limits remain: 20,000 scanned source
files, 2,000,000 bytes per file, and 120 seconds per worker task. This does not
guarantee every project under those limits fits in memory or finishes in time.

`npm test` passes 10 frontend unit checks, 43 Node subtests including browser E2E,
and the selection-rendering regression. Regression tests cover split multibyte
banners, pending launch reuse, independent roots, timeout cleanup, early exits,
deactivation, large-project fallback and recovery after failed startup.

For future measurements:

```powershell
node scripts/benchmark-startup.cjs PATH_TO_PROJECT PATH_TO_RUNTIME
```

Machine-readable reports and the browser screenshot are retained under the
gitignored `output/benchmarks/` directory. Temporary clone and stress fixtures
are removed after acceptance checks.
