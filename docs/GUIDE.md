# CodeCity guide

[← README](../README.md) · [فارسی](../README.fa.md)

## The city metaphor

CodeCity follows the metaphor introduced by Richard Wettel and Michele Lanza
in *Visualizing Software Systems as Cities* (VISSOFT 2007; ICSE 2008 tool demo).
With the default mapping:

| Code artifact | City artifact |
| --- | --- |
| Class / module | Building |
| Package / folder | District |
| Number of methods (NOM) | Building height |
| Number of attributes (NOA) | Building footprint |
| Lines of code (LOC) | Building colour (slate → teal → gold → crimson) |
| Imports / calls | Connections between buildings |

Taller buildings have more methods, wider buildings have more attributes, and
warmer colours indicate more source lines. Districts group declarations from
the same folder or package. Rendering uses bundled three.js and works offline.

## Quick start

CodeCity runs on Node.js 22.13 or newer. It starts in **Simple** mode with an
empty city. Choose **Project → Open project** and select a folder. Source is
scanned locally without installing or executing the project's dependencies.

Simple mode includes **Map metrics** and **Git history**. Search, district
filters, and street controls are available in Advanced mode. Set height,
footprint, colour, and mapping, then click **Save as default** to store them in
`~/.codecity/profile.json` (on Windows, `%USERPROFILE%\.codecity\profile.json`).
This profile is loaded at the next launch, including when the launcher uses a
different port. Changes are temporary until saved. Tooltips and the help guide
follow the selected interface language.

Git commit inspection reads blobs incrementally and discards binary assets.
It uses the same 2 MB per-file limit as source scanning, with limits of 128 MB
of retained source, 256 MB of transferred objects, and 20,000 candidate files.

From this checkout, launch with one command; no dependency install is needed:

```bash
npm start
# Or open a folder immediately:
npm start -- --root /path/to/project
```

### One-command npm / npx launch

Run directly from the GitHub source archive
(no Git installation required):

```bash
npx --yes --package=https://codeload.github.com/Amin-Tgz/CodeCity/tar.gz/refs/heads/main codecity
```

The shorter registry command is available only **after publishing** this
package to npm. Check registry availability before using:

```bash
npx codecity-viewer
# Or install once and keep the command:
npm install -g codecity-viewer
codecity
```

To try the package locally before publishing:

```bash
npm pack
npx --yes --package ./codecity-viewer-0.4.0.tgz codecity
```

The launcher opens your browser, prints its URL, and chooses a free port if
8137 is occupied. Options: `--root FOLDER`, `--port NUMBER`, `--no-open`.
Bundled parsers and three.js make the installed app usable offline.

### Installer (also works when Node is missing)

From this checkout on Windows, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

On macOS or Linux:

```bash
sh scripts/install.sh
```

Windows users can also bootstrap in PowerShell:

```powershell
& ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/Amin-Tgz/CodeCity/main/scripts/install.ps1').Content))
```

On macOS or Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/Amin-Tgz/CodeCity/main/scripts/install.sh | sh
```

The installer reuses compatible Node and npm. If Node is missing or older
than 22.13, it downloads the **latest LTS** from nodejs.org, verifies SHA-256,
and installs a private runtime for CodeCity. No administrator rights are
required. Use `-NodeChannel current` on Windows or
`CODECITY_NODE_CHANNEL=current` on Unix to choose latest Current instead.
Node's [release policy](https://nodejs.org/en/about/previous-releases)
recommends LTS releases for production use.

Windows installs under `%LOCALAPPDATA%\CodeCity` and adds its launcher to
your user PATH. Unix installs under `~/.local/share/codecity` (or
`$XDG_DATA_HOME/codecity`), with a launcher at `~/.local/bin/codecity`;
add that folder to PATH if needed. Both launch the app after installation.
Use `-NoLaunch` or `CODECITY_NO_LAUNCH=1` to install without launching.
An installer can use a local package with `-PackageSpec PATH` or
`CODECITY_PACKAGE=PATH`. Downloaded installers use the GitHub source archive
by default; checkout installers use the checkout itself.

### Simple and Advanced modes

**Simple** is the default. It keeps project access, metric mapping, saved
metric defaults, Git history, the legend, the building list, selected-building
connections and source preview close at hand.

Choose **Advanced** for district filtering, street controls, investigations,
shared-route inspection, minimap, grid, auto-hide, auto-orbit, metric evidence,
member lists, editor settings, and scan diagnostics. Clicking a metric opens
its evidence in Advanced. Switching to Simple clears district filters and
investigation highlights. Git playback and metric settings are retained.
The interface and investigation explanations support all eight UI languages.

Then drag to orbit, wheel to zoom, right-drag to pan, click a building for
details. Use the building list, the district filter, the metric dropdowns, and
the streets / grid toggles.

The UI language selector offers English, Spanish, French, German, Chinese,
Japanese, Arabic, and Persian. Arabic and Persian use a right-to-left layout;
code identifiers and file paths retain their original spelling.
Language and folded panel choices are remembered in browser storage.
Selecting a building temporarily folds Explore and positions its details
below the folded header. Closing details restores Explore; reopening
Explore dismisses the selection.

Controls, legend, navigation, building details, and the building list can be
minimized. **Auto-hide** folds idle panels after 1.5 seconds; hovering their
header or moving keyboard focus into them reveals the contents. The setting
is remembered. Responsive controls use full-width selectors and scroll when
the window is short. The top bar wraps without covering the Explore panel.
Selecting a building highlights its neighbors and dims unrelated buildings.
Blue indicates incoming dependencies, amber outgoing, and purple both directions.
A brief light pulse introduces the related buildings; paused animations and
reduced motion disable it. The dependency map in the details panel has directed
arrows and selectable nodes, with keyboard support and expandable neighbor lists.
**Highlight related buildings** is the default. **Ground streets** adds local
streets; **Off** disables city relationship highlighting and streets.

Building details have **copy path** and **Open in file manager** actions.
On Windows, Explorer selects the source file; on Linux, `xdg-open` opens its
containing folder in the default file manager; on macOS, Finder reveals it.

### Mixed-language scanning

The portable launcher **always scans source** and does not look for CodeGraph.
It supports over 40 language/file families including Python, JS/TS/React,
C/C++, Qt UI/QML, C#, Java, Go, Rust, PHP, Ruby, Swift, Dart, Vue, and Svelte.
Unknown text files with recognizable source declarations receive file-level
buildings too. Binary files, symlinks, dependency folders, generated output folders,
and files over 2 MB are excluded; scans are capped at 20,000 source files.
Skip warnings are available in the source badge's tooltip.

JS/TS/JSX/TSX use the bundled TypeScript 5.9.3 syntax parser and an
in-memory local symbol checker. Python, Java, C#, Go, C, and C++ use bundled
Tree-sitter WASM grammars; other languages retain explicitly labelled
heuristic adapters. Nothing in the analyzed project is executed or loaded.
Parser diagnostics lower confidence instead of silently claiming exact counts.
The source badge and each building's metric evidence disclose the parser,
version, count rules, ranges, confidence, and limitations. The JS/TS checker
follows relative imports, aliases, namespace imports and re-exports, and
respects lexical shadowing. External packages, tsconfig path aliases, dynamic
dispatch, HTTP/RPC, and cross-language runtime calls remain unresolved.
Dependencies for languages other than JS/TS are module-reference estimates.
C/C++ includes use syntax nodes (ignoring comments and string literals),
resolve quoted headers beside their source, and recognize public include roots
such as `modules/core/include/opencv2`. If `compile_commands.json` exists at
the project root or under `build/`, include resolution uses the per-file
`-I`, `-isystem`, `-iquote`, and `/I` paths in their declared order. Commands
are only read, never executed. Ambiguous headers are reported without
inventing a connection. Include roads connect file modules; they do not claim
that the first class in a header was called. C++ types include namespace and
nested type names, with declaration ranges, overloads and fields from syntax.
Preprocessing and compiler-based C++ call graphs are not included; macro-heavy
code can still have low-confidence metrics. The compilation database format
is documented by [Clang](https://clang.llvm.org/docs/JSONCompilationDatabase.html).
Generated source outside excluded output folders remains visible with a
path/header classification and is excluded from investigation rankings.

Git history loads automatically when Git is installed.

### Project exclusions and scan diagnostics

Choose **Project → Exclusions…** to omit a folder, file, class/module, or path
pattern. Type to search the available paths and declarations, add rules, then
click **Apply exclusions**. Selected building details also offer **Exclude
class / module**, **Exclude file**, and **Exclude folder** shortcuts. Remove
a rule and apply again to restore the source. Exclusions remove the relevant
buildings and their edges without modifying project files. Rules are saved
per project beside the recent-project settings, including across app restarts.
They also apply to commit-structure snapshots and follow Git-detected file
renames to the current path.

The Open project dialog accepts optional patterns before the initial scan.
Paths use `/` and are relative to the project root: `*` matches within a
folder, `**` matches nested folders, and `?` matches one character.
For example, `**/tests/**`, `samples/`, and `**/*.generated.*`.
Choose **Folder** for an entire directory; a path pattern `samples/**` excludes
its descendants. Rules can be cancelled before applying.

**Exclusions → Scan diagnostics** shows resolved, ambiguous and unresolved
reference counts and offers a JSON report with warnings, bounded examples,
counts per language and scan timings. Unresolved references can be external
libraries, missing generated headers, dynamic imports or unsupported aliases;
their count does not by itself measure graph accuracy. Set `CODECITY_TRACE=1`
before starting the app for detailed JSON dependency events in the terminal.
Example in PowerShell: `$env:CODECITY_TRACE='1'; npm start`.

Repeated declarations, conditional alternatives and copies in different files
receive distinct building identities. Known documentation and snapshot files
(`.txt`, `.rst`, `.snap`, `.lock`) are not interpreted as source examples.
`CMakeLists.txt` remains recognized. If an input repeats a normalized source
path, the first copy is retained with a warning.

To repeat the real-project investigation without running project code:

```bash
git clone --depth 1 --branch 4.x https://github.com/opencv/opencv.git output/research/projects/opencv
git clone --depth 1 https://github.com/django/django.git output/research/projects/django
git clone --depth 1 https://github.com/vuejs/core.git output/research/projects/vue
npm run audit:project -- output/research/projects/opencv output/research/opencv-after.json
```

The audit validates IDs and roads, records parser confidence and dependency
evidence, and checks representative OpenCV include connections. Research
checkouts and reports stay in ignored `output/research/`.
See [RESEARCH.md](RESEARCH.md) for the measured before/after results and
remaining analysis limits.

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
high fan-out (at least
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
parser assets.

## Project structure

- `server/`: Node launcher, local API, source analysis workers, and bundled parsers.
- `src/`: city rendering, Simple/Advanced modes, and exploration controls.
- `vendor/`, `assets/`: offline three.js and app artwork.
- `scripts/install.ps1`, `scripts/install.sh`: Node-aware installers.
- `tests/`: Node unit tests and browser checks.

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
  animate while playing, and disappear on pause or completion. The Node
  launcher uses your installed Git. A folder
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
  coupling and state. These signals guide source review; they do
  not claim that size or colour alone proves code quality.

**Accessibility** - the **☰** button opens a filterable list of every building
(keyboard-focusable, ARIA-labelled); <kbd>[</kbd> / <kbd>]</kbd> step through
buildings in name order.
Large lists offer a “Show more” button. The help dialog supports Escape,
keyboard focus containment and focus restoration.

Clicking a building lists its members and incoming/outgoing dependencies.

Street modes: **all**, **selected building only** (relationship on demand -
picking a building shows just its incident lanes), or **off**; plus a **grid**
toggle. Distant buildings drop their window facade and shadows (level of
detail) to keep large cities fast.

The colour ramp runs slate → teal → gold → crimson so low- and high-LOC
buildings stay visually distinct.

## Offline / vendored three.js

three.js is vendored under `vendor/`; no CDN or runtime download is needed.
Keep its pinned files and accompanying license when updating the vendor.

## Metric mapping

The three dropdowns in the left panel let you remap the city live:

- **height** - methods (NOM, default), attributes, lines, dependencies
- **footprint** - attributes (NOA, default), methods, lines, dependencies
- **colour** - lines (LOC, default, slate→teal→gold→crimson), methods,
  attributes, dependencies

Height/footprint/mapping changes rebuild geometry. Colour-only changes preserve
positions, meshes and street routes. The
**colour** dropdown also offers **language**, with one hue per programming
language and a swatch legend. Dependency metrics sum the weights of incoming
and outgoing identified connections.

## Notes

- Project models are scanned by the Node launcher when you open a folder.
- Optional ground streets show local dependencies. Connections without a ground
  route are retained in the shared connections list and dependency map, with no
  elevated roads. Selecting a building shows its incoming/outgoing neighbors
  independently of the ground drawing budget. The top bar counts individual
  represented links. A building with no identified links is labelled as such;
  absence of evidence does not establish independence.
- **Pause animations** stops ambient motion and pedestrians. Auto-orbit and
  Git playback have separate controls.

## Validation

Run the Node tests and optional benchmark:

```bash
npm test
npm run benchmark
```

For browser checks, start an isolated local server and choose Advanced mode.
The launcher serves runtime assets only. In a Playwright runner, expose the
checked-out test modules to that page before importing them (replace the path
with your absolute checkout path):

```js
await page.route('**/tests/*.js', route => route.fulfill({
  path: '/absolute/path/to/CodeCity/tests/' + route.request().url().split('/').pop(),
  contentType: 'text/javascript',
}));
await page.evaluate(async () => ({
  city: await (await import('./tests/browser_checks.js')).runBrowserChecks(),
  surroundings: await (await import('./tests/browser_surroundings.js')).runSurroundingsChecks(),
  improvements: await (await import('./tests/browser_improvements.js')).runImprovementChecks(),
}));
```

The browser suite covers rendering, 240 combinations of metric mappings,
filter/history/compare interactions, investigations, streets, keyboard list,
help, member highlighting, and empty models. The UI history/member checks
use the checked-in example model; the optional UI history check skips models
without a timeline. Surroundings checks verify tree boundaries, bird motion,
reduced motion, resource disposal and separation from selectable code.
`tests/browser_flows.js` exports
`runBrowserFlows(page)` for a Playwright page, covering
selection folding, reopening Explore, removed output controls, Git playback,
construction motion, pause, and return to the current model. The output and
comparison controls and CPU/RAM UI have been removed.

`tests/browser_modes.js` exports `runModeChecks(page, projectPath)` for a
fresh isolated Node server and a small source fixture. It checks mode
defaults and persistence, source preview, metric evidence, investigation cleanup,
the folder dialog, and mobile Persian layout. On Windows, run
`powershell -NoProfile -ExecutionPolicy Bypass -File tests/installer.windows.ps1`
to check missing/outdated Node, Current selection, and corrupt downloads
with mocked network responses and no user PATH changes.

See [REVIEW.md](REVIEW.md) for review findings, verified behavior, remaining
limitations and suggested next improvements.
