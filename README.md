# CodeCity

A 3D visualization of a codebase as a **city**. It follows the *CodeCity*
metaphor introduced by Richard Wettel and Michele Lanza
(*"Visualizing Software Systems as Cities"*, VISSOFT 2007; ICSE 2008 tool demo):

| Code artifact            | City artifact |
| ------------------------ | ------------- |
| class / module           | **building**  |
| package / folder         | **district**  |
| number of methods (NOM)  | building **height** |
| number of attributes (NOA)| building **footprint** |
| lines of code (LOC)      | building **colour** (grey → intense blue) |
| imports / calls          | **streets** between buildings (with pedestrians) |

Bigger, taller, bluer buildings = bigger, busier, heavier classes. Districts
are groups of classes that live in the same folder/package.

It is **reusable for any folder**, renders with **three.js**, and runs
**fully offline** once the vendor files are downloaded.

## Quick start

CodeCity now runs without Python, pip, CodeGraph, compilers, or the project's
dependencies. It opens an **empty city**; choose **Project → Open project**,
browse to a folder (or paste its path), and open it. Recent folders are saved
on this computer. **Close project** clears the city while keeping recents.

```bash
cd codecity
npm start
# or select a project at startup:
npm start -- --root /path/to/project
```

Node.js 22.13 or newer is required for npm, but **no npm install is needed to
run the app from source**. Parser assets and three.js are vendored; no runtime dependency installation
is needed. The launcher prints a browser URL and automatically
chooses a free port if the default 8137 is unavailable.

### npm / npx distribution

Build a portable npm package from this checkout:

```bash
npm pack
npx --package ./codecity-viewer-0.4.0.tgz codecity
# or install the same package:
npm install -g ./codecity-viewer-0.4.0.tgz
codecity --root /path/to/project
```

The package is ready to publish as `codecity-viewer`; it has **not** been
published by this change. After publication, the command will be
`npx codecity-viewer`. npm/npx require Node.js, never Python.

### Docker

```bash
docker build -t codecity .
docker run --rm -p 127.0.0.1:8137:8137 -v "/path/to/project:/projects:ro" codecity
```

Open `http://localhost:8137` and choose `/projects` in the Project menu.
Windows example: `-v "D:/Projects/MyApp:/projects:ro"`. With Compose, set
`CODECITY_PROJECT` to the host folder, then run `docker compose up --build`.
The project mount is read-only; a named volume saves recent projects.
The file manager button is disabled in Docker because a container cannot
open the host desktop's file explorer. Use npm or a standalone binary for it.

### Standalone binaries

```bash
npm ci
npm run build:binary
```

The result is `dist/codecity.exe` on Windows or `dist/codecity` on Linux/macOS.
It embeds Node, the scanner, and the complete offline viewer, so users need
**neither Node nor Python installed**. Build on each target platform; the
release workflow builds Windows x64, Linux x64, and macOS binaries with a
manual workflow run or a `v*` tag. The Windows executable is unsigned.
Run the executable, or pass `--root`, `--port`, and `--no-open` as needed.

Build the Linux x64 executable from Windows using Docker:

```bash
docker build --platform linux/amd64 -f Dockerfile.binary --output type=local,dest=output/linux .
```

This produces `output/linux/codecity-linux-x64` for Linux with glibc 2.36+
(Debian 12 / Ubuntu 24.04 or newer). The regular Docker image also works on
hosts where this native binary's system libraries are unavailable.

Then drag to orbit, wheel to zoom, right-drag to pan, click a building for
details. Use the search box, the district filter, the metric dropdowns, and
the streets / grid toggles.

The UI language selector offers English, Spanish, French, German, Chinese,
Japanese, Arabic, and Persian. Arabic and Persian use a right-to-left layout;
code identifiers, queries, and file paths retain their original spelling.
Language and folded panel choices are remembered in browser storage.
Selecting a building temporarily folds Explore and positions its details
below the folded header. Closing details restores Explore; reopening
Explore dismisses the selection.

Controls, legend, navigation, building details, and the building list can be
minimized. **Auto-hide** folds idle panels after 1.5 seconds; hovering their
header or moving keyboard focus into them reveals the contents. The setting
is remembered. Responsive controls use full-width selectors and scroll when
the window is short. The top bar wraps without covering the Explore panel.
Selecting a building highlights its incident streets and pedestrians in
both **all** and **selected** street modes. **Off** hides all streets.

Building details have **copy path** and **Open in file manager** actions.
On Windows, Explorer selects the source file; on Linux, `xdg-open` opens its
containing folder in the default file manager; on macOS, Finder reveals it.

### Mixed-language scanning and CodeGraph

The portable launcher **always scans source** and does not look for CodeGraph.
It supports over 40 language/file families including Python, JS/TS/React,
C/C++, Qt UI/QML, C#, Java, Go, Rust, PHP, Ruby, Swift, Dart, Vue, and Svelte.
Unknown text files with recognizable source declarations receive file-level
buildings too. Binary files, symlinks, dependency folders, generated output folders,
and files over 2 MB are excluded; scans are capped at 20,000 source files.
Skip warnings are available in the source badge's tooltip.

JS/TS/JSX/TSX use the bundled TypeScript 5.9.3 syntax parser and an
in-memory local symbol checker. Python, Java, C#, and Go use bundled
Tree-sitter WASM grammars; other languages retain explicitly labelled
heuristic adapters. Nothing in the analyzed project is executed or loaded.
Parser diagnostics lower confidence instead of silently claiming exact counts.
The source badge and each building's metric evidence disclose the parser,
version, count rules, ranges, confidence, and limitations. The JS/TS checker
follows relative imports, aliases, namespace imports and re-exports, and
respects lexical shadowing. External packages, tsconfig path aliases, dynamic
dispatch, HTTP/RPC, and cross-language runtime calls remain unresolved.
Dependencies for languages other than JS/TS are module-reference estimates.
Generated source outside excluded output folders remains visible with a
path/header classification and is excluded from investigation rankings.

Git history loads automatically when Git is installed. Coverage can be
imported from **Investigate → Import coverage JSON** using exact relative
paths (or absolute paths under the project root): `{ "src/a.ts": 0.8 }`,
`{ "src/a.ts": 80 }`, or `{ "src/a.ts": { "pct": 1 } }` for an explicit 1%.
Istanbul summary entries with `lines.pct` are supported. Coverage is file-level
and shared by the declarations in that file; missing coverage stays unknown.

### Source and dependency investigation

Select a building and click a metric value to open its evidence. Click a
member to preview its actual source lines, highlighted within surrounding
context. A changed file produces a rescan notice. Previews contain at most
400 lines and use the authenticated local launcher; static hosting cannot
read files from the project. Configure **Editor link settings** with
`{path}`, `{line}`, and `{end}` placeholders, for example
`vscode://file/{path}:{line}`. Historical previews use Git blobs and do not
open a current file at obsolete line numbers.

The inspector lists incoming/outgoing edges, kinds, weights and source
symbols/lines, including links without a street. Cycles are strongly connected
components in the available directed graph. Click an edge to inspect its
other building. Package breadcrumbs filter a package and its descendants;
the minimap offers a compact spatial overview with clickable buildings.

Investigation presets expose their thresholds and sortable evidence:
large and untested (LOC ≥ 200, known coverage < 50%), high fan-out (at least
5 distinct targets), syntactic complexity (at least 15), frequent changes
(at least 3 non-merge commits touching the file, following detected file
renames), and dependency cycles. These are candidates for source review.

### Structural history and performance

The timeline offers **Approximate growth** (net file lines) and **Commit
structure** (a freshly parsed model from a selected commit). Commit structure
restores deleted types, member boundaries and past local dependencies without
checking out files. File identities follow Git-detected renames; symbol renames
appear as additions/removals. **Compare with current** includes removed
buildings as green ghosts and marks structural changes, including changes
with equal LOC. Metric scales stay fixed to the current model. A union of
visited declarations reserves spatial slots so comparison and subsequent
frames preserve positions; discovering a previously unseen old declaration
may initially expand the layout. Approximate growth remains inexpensive and
explicitly labelled. At most 96 timeline commits are sampled; the selected
commit is reconstructed on demand, with three cached models. Historical
snapshots cap trees at 20,000 eligible files and 80 MB of blob data and exclude
files over 2 MB, matching the scanner's per-file limit. Coverage from today's
working tree is not copied onto old commits.

Project analysis runs in Node workers; street routing runs in a browser
worker. The model retains all resolved edges; only the 2,500 heaviest are
eligible for drawing. Streets stay inside one continuous package terrace and
avoid higher terraces; cross-package links are represented in the selectable
dependency inspector. Buildings use GPU instancing at 500 or more buildings,
and ray picking uses a spatial index. Colour changes update materials without
moving buildings or rerouting streets. **Pause motion**, or reduced-motion
preferences, stops decorative motion and avoids drawing idle frames; normal
animated scenes continue rendering while birds/pedestrians move.

Run `npm run benchmark` for reproducible 100/500/2,000-building analysis,
layout, routing and picking measurements. Browser benchmarks also verify GPU
draw calls and picking against an exhaustive raycast. These fixtures do not
establish a general repository-size or frame-rate guarantee.

Pinned parsers and grammars are checked in under `server/`; runtime use needs
no npm installation or network. `npm ci && npm run build:parsers` refreshes
these assets and the analysis-worker bundle during development. The
[TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
is used with a virtual source host; bundled license notices accompany all
parser assets. Binaries embed the workers and WASM files too. To build while
an existing executable is running, use
`node scripts/build-binary.cjs --output-dir output/build-validation`.

### Optional Python / static workflow

The original Python launcher and static viewer still work for existing models:

```bash
python serve.py --rebuild
python -m http.server 8137        # then open http://127.0.0.1:8137/index.html
```

Static/Python hosting renders cached `city.json`; project opening and file
manager integration require the new npm, binary, or Docker launcher.

## Building the model

`build_city.py` turns a codebase into `city.json`:

```bash
python build_city.py                       # auto: this CodeCity repo
python build_city.py D:\some\project       # any folder
python build_city.py --source scan         # force the dependency-free scanner
python build_city.py --codegraph path\to\codegraph.db
python build_city.py --history             # also record a git-history timeline
python build_city.py --coverage cov.json   # colour by coverage {path: pct}
```

Two data sources, tried in order (`--source auto`, the default):

1. **codegraph** - if a CodeGraph SQLite index exists at
   `<root>/.codegraph/codegraph.db`, it is used. This yields accurate classes,
   methods, attributes and call/import edges.
2. **scan** - a standard-library source scanner that walks the tree. Python
   uses its AST parser for classes, async methods, assigned fields and member
   lists. This legacy Python builder uses JS/TS regex estimates; other supported languages
   fall back to file-level counts. No tools or network are required.

The default root is the CodeCity directory. Pass a root explicitly to analyze
another project. `serve.py --root PATH` rebuilds the model even if a cached
`city.json` exists; `--no-build` keeps the cached model. The checked-in model
is an example from another project, so use `--rebuild` to view CodeCity itself.

Both paths emit the same schema:

```jsonc
{
  "meta": { "root", "source", "totals", "languages", "legend" },
  "districts": [ { "id", "name", "depth", "buildings", "loc", "methods" } ],
  "buildings": [ {
      "id", "name", "kind", "file", "district", "language",
      "loc", "methods", "attributes", "functions",
      "nom", "noa", "deps", "start_line"
  } ],
  "roads": [ { "a", "b", "kind", "weight" } ]
}
```

`nom` (height metric) and `noa` (footprint metric) are the canonical CodeCity
metrics; `deps` is the summed dependency weight from the roads.
Zero metrics remain zero in the JSON; minimum visual dimensions only affect
rendering. A mixed Python or JS file can contain both class buildings and a
module building for its top-level functions/state.

## Files

```
codecity/
  build_city.py     model builder (codegraph DB or source scan) -> city.json
  city.json         generated model consumed by the viewer
  serve.py          build + static server + open browser (stdlib only)
  fetch_vendor.py   one-time three.js download into vendor/
  index.html        the viewer
  styles.css        UI styling
  src/
    main.js         three.js scene, camera, lights, time-of-day, event wiring
    city.js         turns city.json into meshes (districts, buildings, roads)
    layout.js       squarified treemap layout
    metrics.js      metric definitions, scaling, colour ramps
    textures.js     procedural facade/window, road/street, sky and grass textures
    landscape.js    decorative meadow, forest, river, hills and bird flock
    quality-guide.js illustrated guide to reviewing visual code signals
  assets/
    codecity.svg    code brackets + city skyline logo and favicon
    ui.js           HUD, legend, tooltip, details panel
  vendor/
    three.module.js three.js r160 (vendored, offline)
    OrbitControls.js
  preview/          day.png / night.png renders of this repo
```

## Visual design

The city is built procedurally - no external 3D models, so it stays offline
and applies to any codebase:

- **Buildings** are plain boxes with a procedurally generated **window
  facade**; height varies per building (stable hash) so equal-metric modules
  are not uniform slabs. The scene is fixed **daytime** (no day/night cycle).
- **Districts** are raised plates with a curb, and **nested packages** sit on
  progressively higher terraces (the paper's package topology). **Streets** are dependency
  edges routed on the ground as **orthogonal, grid-aligned lanes** that avoid
  every building footprint (buildings are shrunk + margined to leave
  corridors). Wide **roads** (yellow lane lines) carry the heaviest links,
  narrower **streets / alleys** (white centre line) the rest, and **people**
  walk each lane - their number matches the connections it carries.
- **Surroundings** — a green meadow, mature trees, rolling hills, a river,
  footbridge, and slowly flying birds surround each city. A perimeter road
  separates the code city from the landscape. These are decorative, never
  code metrics or selectable buildings. Birds stay still when the browser
  requests reduced motion. Closing the project leaves an empty meadow.
- **Git-history time-lapse** — the portable launcher detects Git repositories
  automatically; **Build history** in the top bar plays their commits, and a
  slider in Explore scrubs the history. Two tower cranes and three loaders
  animate while playing, and disappear on pause or completion. The Docker
  image includes Git; npm/native launchers use your installed Git. A folder
  with no commits or a missing Git executable shows a clear status.
  Buildings
  appear as their files are first added and grow toward their final height.
  The final slider position shows the current model, including uncommitted
  files. Approximate growth uses net-line counts for today's files. The separate
  Commit structure mode reconstructs past types, members and dependencies.
- **Auto-orbit** (⟳) gives a hands-free "city tour" camera.
- **Help tab** (the **?** button, or press <kbd>?</kbd>) explains the metrics
  (NOM / NOA / LOC / DEPS, plus the NOC mix-up) and walks through how to
  analyse a codebase with the tool. Side-by-side examples show balanced and
  unusual cities, with guidance on large outliers, district boundaries,
  coupling, state, and coverage. These signals guide source review; they do
  not claim that size or colour alone proves code quality.

**Accessibility** - the **☰** button opens a filterable list of every building
(keyboard-focusable, ARIA-labelled); <kbd>[</kbd> / <kbd>]</kbd> step through
buildings in name order.
Large lists offer a “Show more” button. The help dialog supports Escape,
keyboard focus containment and focus restoration.

**Query / tag** - the query box (`type:class`, `loc>200`, `lang:ts`,
`district:backend`, or a bare word matching name/file; terms AND-combine)
tints every matching building and dims the rest, and queries can be saved.
Clicking a building lists its members (methods/attributes) for source previews
and dependency investigation.
Language aliases include `ts`, `tsx`, `js`, `jsx`, `py`, and `cs`.

Street modes: **all**, **selected building only** (relationship on demand -
picking a building shows just its incident lanes), or **off**; plus a **grid**
toggle. Distant buildings drop their window facade and shadows (level of
detail) to keep large cities fast.

The colour ramp runs slate → teal → gold → crimson so low- and high-LOC
buildings stay visually distinct.

## Offline / vendored three.js

three.js is vendored under `vendor/` so the page needs no CDN. If the files
are ever missing, fetch the pinned version once:

```bash
python fetch_vendor.py            # three.js r160
python fetch_vendor.py 0.161.0    # or any version
```

## Metric mapping

The three dropdowns in the left panel let you remap the city live:

- **height** - methods (NOM, default), attributes, lines, dependencies
- **footprint** - attributes (NOA, default), methods, lines, dependencies
- **colour** - lines (LOC, default, slate→teal→gold→crimson), methods,
  attributes, dependencies

Height/footprint/mapping changes rebuild geometry. Colour-only changes preserve
positions, meshes and street routes. The
**colour** dropdown also offers semantic modes: **language** (a hue per
language, shown as a swatch legend) and **coverage** (red → green), the latter
only when the model was built with `--coverage`.
  Missing coverage is grey; zero coverage is red. Numeric coverage values
  in `[0, 1]` are fractions; values above 1 are percentages. An explicit
  `{ "pct": 1 }` means 1%, resolving that boundary ambiguity.

## Notes

- `.codegraph/` and generated models are machine-local; run `build_city.py`
  (scan mode) to regenerate `city.json` anywhere, with no tooling.
- Streets are dependency edges between buildings (up to 2,500 drawn by
  weight, toggleable) and drawn on the ground with pedestrians — they are an
  addition on top of the classic CodeCity metaphor, which only uses positions,
  sizes and colours.
  Links without a clear street route, across package terraces, or beyond the
  drawing budget remain in the model and dependency inspector; the top bar
  reports the number of links without streets.

## Validation

No Python packages or npm installation are needed for the unit tests:

```bash
python -m unittest discover -s tests -v
npm test
npm run benchmark
```

For browser checks, start `python serve.py --no-build --no-open`. In the
browser's developer console, run:

```js
await (await import('./tests/browser_checks.js')).runBrowserChecks()
await (await import('./tests/browser_surroundings.js')).runSurroundingsChecks()
await (await import('./tests/browser_improvements.js')).runImprovementChecks()
```

The browser suite covers rendering, 240 combinations of metric mappings,
filter/history/compare interactions, query controls, streets, keyboard list,
help, member highlighting, and empty models. The UI history/member checks
use the checked-in example model; the optional UI history check skips models
without a timeline. Surroundings checks verify tree boundaries, bird motion,
reduced motion, resource disposal and separation from selectable code.
`tests/browser_flows.js` exports
`runBrowserFlows(page)` for a Playwright page, covering
selection folding, reopening Explore, removed output controls, Git playback,
construction motion, pause, and return to the current model. The output and
comparison controls and CPU/RAM UI have been removed.

See [REVIEW.md](REVIEW.md) for review findings, verified behavior, remaining
limitations and suggested next improvements.
