# CodeCity review — 5 October 2026

The project is a useful offline prototype for surveying a codebase. The
classes/buildings, packages/districts and NOM/NOA mappings follow the core
metaphor in Wettel and Lanza's
[Visualizing Software Systems as Cities](https://wettel.github.io/download/Wettel07b-vissoft.pdf).
LOC colouring, dependency roads and infrastructure gauges are extensions.
The strongest next step is making the analysis more trustworthy and easier
to connect back to source code.

## Reproduced problems fixed

| Area | Problem and resulting behavior |
| --- | --- |
| Source selection | `--source codegraph` incorrectly called the scanner. Both indexed modes now use the database. An explicitly missing database/root produces an error. Discovery no longer silently uses a neighboring project's index. |
| Project selection | Default scanning included the parent workspace. It now targets this repository. An explicit `serve.py --root` or non-auto source rebuilds a cached model. |
| Python metrics | Class LOC extended into unrelated functions; async methods disappeared; nested classes could share an ID; member lists were empty. AST parsing now provides scope boundaries, qualified IDs, async methods, assigned fields and members. Mixed files retain a module building. |
| JS/TS metrics | Control-flow blocks were counted as methods and braces in strings affected class boundaries. The scanner now masks comments/strings and counts methods/fields at class scope. Top-level helpers/state in mixed files remain visible. This is still an estimate. |
| Dependencies | Python imports produced no roads. Dotted and relative imports now resolve to source files. JS side-effect and dynamic relative imports are included. Dependency degrees are also written to the model instead of existing only in the browser. |
| Raw counts | Zero NOM/NOA values were replaced by one, obscuring empty classes/modules. Raw values now remain zero; visual minimum sizes stay in rendering. Method calls no longer inflate field estimates. |
| Coverage | Suffix matching attached coverage to the wrong filename; explicit 1% was interpreted as 100%. Matching now respects path boundaries and explicit percentages. Unknown coverage has a separate grey colour. |
| Comparison | LOC changes excluded additions/removals; arbitrary JSON was treated as a baseline. Totals now include both and invalid/duplicate buildings are rejected. |
| Viewer state | Remapping discarded selection/filter/history effects, hover erased comparison colours, and clearing comparison erased queries. State now composes and survives rebuilding. |
| Picking/streets | Invisible buildings intercepted clicks. Filtered/history-hidden endpoints still showed roads. Picking and displayed roads now follow visibility; selected streets stay attached to the selected building. Unroutable links no longer get an unchecked road through intervening buildings; the HUD reports how many were omitted. |
| Rebuild resources | Old focus groups stayed attached, and inactive facade materials could be retained. Rebuilds now release these resources; root group counts remain stable. |
| History | Remapping lost height baselines; scrubbing overrode district filters; uncommitted files vanished on startup. History now composes with filtering/remapping and offers a separate current-model position. Playback immediately displays its starting frame. Rename line counts are recorded as removal/addition. |
| Legend | A vertical ramp was stretched into a horizontal legend, and labels always showed default mappings. The ramp and labels now follow the actual mapping. |
| Saved queries/text | `lang:ts` matched nothing; malformed/unavailable storage could break controls; saved names and infrastructure text entered HTML directly. Aliases, storage recovery, safe option construction and escaped manifest text are implemented. |
| Live metrics | Request-thread CPU sampling could repeatedly show a first-sample zero. Sampling now shares a process-wide delta. Turning live off or receiving an unavailable/error sample restores estimates; timed-out/in-flight requests are handled. Labels explicitly describe whole-machine usage. |
| Accessibility | The list silently stopped at 400 entries; help allowed focus to escape; several icon controls had no useful accessible name. Lists can expand, help contains/restores focus, and controls/statuses have labels. |
| Layout/errors | Query controls wrapped awkwardly, export controls overflowed, and the infrastructure panel covered controls/legend. Panels now fit at desktop and 390px widths. Model/WebGL failures display an error rather than an indefinite loading spinner. |
| Local tools | Reserved port ranges prevented startup despite other free ports. The server can request an OS-assigned port. Requesting a different vendor version no longer skips existing files; both downloads finish before replacement. |

## Validation

- **25 Python tests**: source selection, parsing/scopes/imports, coverage,
  history line accounting, manifests, model export, actual local CPU/RAM,
  HTTP endpoints, root selection, port fallback and vendor download behavior.
- **8 JavaScript unit tests**: query semantics/storage, comparison totals,
  malformed inputs, treemap bounds/area/non-overlap and model validation.
- **21 browser checks**: a small fixture plus the supplied 201-building,
  518-road model. Includes **240 mapping combinations**, rebuilt state,
  picking, streets, history, queries, list navigation, help and member pulses.
- **6 additional browser flows**: actual PNG signature/JSON downloads,
  valid/invalid baseline uploads, live updates/stop and unavailable samples.
- Additional targeted checks: keyboard selection, modal Tab/Escape focus,
  saved-query names containing markup, clipboard success/rejection handlers,
  and layout bounds at 390px and desktop sizes.
- A fresh scan of this repository produced a valid model with unique IDs
  and local dependency roads. The checked-in example `city.json` was retained.

This validates the supported workflows in Chromium on Windows; it is not a
claim of exhaustive coverage of every language, browser or repository.
Real clipboard write completion was observed, but the automated browser's
clipboard readback returned an empty value. Clipboard handlers were therefore
verified with success/rejection stubs; native clipboard round-trip remains
unverified. Vendor downloads used mocked HTTP responses, not a live CDN.
Historical classes and calls from an actual external CodeGraph installation
were not available; database tests used its expected schema in SQLite fixtures.

## Priority follow-up implemented — 5 October 2026

| Priority | Result | Focused validation |
| --- | --- | --- |
| 1. Explainable metrics | Pinned JS/TS parser + local symbol checker, Python/Java/C#/Go WASM adapters, ranges, diagnostics, generated markers and click-to-open evidence. | Grammar fixtures, aliases/re-exports, shadowed calls, incompatible syntax, stable IDs and generated classification. |
| 2. Source/dependency links | Authenticated, bounded source previews; highlighted member ranges; configurable editor links; source-change notices; incoming/outgoing edges, kinds, weights, cycles and links without streets. | Real HTTP source/member access, rejection of non-model IDs, stale-content detection, member/evidence browser clicks and 390px layout bounds. |
| 3. Containment/locality | Recursive package rectangles, descendant filtering, breadcrumbs and clickable minimap; material-only recolouring; shared comparison slots. | Ancestor containment, non-overlapping siblings/buildings, unchanged mesh/route identity and positions on recolouring/comparison. |
| 4. Investigation presets | Explicit thresholds for size/coverage, fan-out, complexity, file churn and cycles; sortable evidence and coverage JSON import. | Unknown coverage exclusion, distinct-target counts, SCC membership, exact coverage paths and explicit 1% handling. |
| 5. Structural history | Parse commit blobs on demand, preserve Git-detected file-rename identities, restore deleted classes/old members/old calls, show removed ghosts and equal-LOC structural changes, retain an explicitly approximate mode. | Three real commits in a nested folder: rename, deletion, source ranges, graph restoration, comparison positions, historical previews, return to current and approximate mode. |
| 6. Large-model work | Node analysis workers, browser routing worker, GPU instancing ≥500 buildings, spatial picking, idle rendering when motion is paused/reduced; terrace-safe streets and selectable omissions. | Worker/direct-model parity and event-loop responsiveness; terrace/budget edge retention; browser rendering at 100/500/2,000 buildings; picking parity; static-frame count. |

Current verification: **29 Node checks** (8 frontend + 21 server/improvement),
**25 Python tests**, **21 browser regression checks**, **6 new browser checks**, **5 scenery/resource checks**
and the dedicated structural-history browser flow all passed. The browser
regression includes 240 mapping combinations. A new Windows standalone binary
launched with embedded parsers, served its routing worker, and reconstructed
an old commit through its authenticated API. The original `dist/codecity.exe`
was in use, so binary validation used a separate output directory. npm's package
manifest includes all five WASM files and the analysis-worker bundle.

Synthetic benchmark, Windows / Node 22.13.1 / Chromium (single run; timings vary):

| Buildings | Analysis | Layout | Routing | Browser city build + routing | Isolated city draw calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100 | 43 ms | 9 ms | 61 ms | 62 ms | 108 |
| 500 | 57 ms | 1 ms | 208 ms | 295 ms | 9 |
| 2,000 | 130 ms | 2 ms | 882 ms | 1,263 ms | 9 |

Fixtures contain simple classes and a same-terrace linear dependency chain.
Draw-call measurements include city plates and streets, exclude decorative
landscape, and use a 128px test canvas. They are not a supported-size or FPS
claim. `npm run benchmark` records local measurements in
`output/benchmarks/latest.json`; browser fixtures are in
`tests/browser_improvements.js`.

## Remaining limits

- Grammar versions are pinned. Newer unsupported syntax is reported with low
  confidence; syntax counts are not runtime semantics. Non-bundled languages
  and non-JS/TS dependencies remain estimates. Local JS/TS symbol resolution
  does not include installed packages or tsconfig path aliases.
- Generated-source classification uses paths/header markers. Coverage and churn
  are file-level evidence shared by declarations; coverage from the working
  tree is not inferred for historical commits.
- History samples at most 96 non-merge commits and reconstructs selected commits
  on demand. Git rename similarity is heuristic; symbol renames remain
  additions/removals. Discovering an old declaration initially expands the
  union layout; subsequent comparisons/frames preserve reserved slots. Metric
  scales use the current model, so historical outliers can saturate the ramp.
- Snapshots retain excluded-folder/per-file limits, and bound eligible trees
  and total blob data. Three models are cached; workers bound execution time.
- Cross-package/terrace dependencies use the selectable inspector rather than
  elevated road geometry. All resolved links remain in the model; the drawing
  budget is 2,500. GPU instancing uses a shared facade and disables building
  shadows for large cities; proxy geometry still supports precise picking.
- Continuous decorative motion still requires drawing frames. Pause motion or
  reduced motion enables idle rendering. Dense graphs and larger real-world
  repositories need separate benchmarking before any supported-limit claim.
- The optional legacy Python/static builder retains its original parsers and
  approximate history. Live source previews and structural snapshot requests
  require the portable launcher. Configured native editor handlers and Linux/
  macOS binaries were not exercised in this Windows session.
