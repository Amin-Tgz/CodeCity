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

```bash
cd codecity
python serve.py            # builds city.json (if missing) and opens the browser
```

Then drag to orbit, wheel to zoom, right-drag to pan, click a building for
details. Use the search box, the district filter, the metric dropdowns, and
the streets / grid toggles.

No `serve.py`? Any static server works, because the app is plain ES modules:

```bash
python -m http.server 8137        # then open http://127.0.0.1:8137/index.html
```

## Building the model

`build_city.py` turns a codebase into `city.json`:

```bash
python build_city.py                       # auto: this repo (parent folder)
python build_city.py D:\some\project       # any folder
python build_city.py --source scan         # force the dependency-free scanner
python build_city.py --codegraph path\to\codegraph.db
python build_city.py --history             # also record a git-history timeline
```

Two data sources, tried in order (`--source auto`, the default):

1. **codegraph** - if a CodeGraph SQLite index exists at
   `<root>/.codegraph/codegraph.db`, it is used. This yields accurate classes,
   methods, attributes and call/import edges.
2. **scan** - a standard-library source scanner (regex-based) that walks the
   tree and estimates the same metrics. Works on **any** folder with no tools
   or network required. Handles Python and JS/TS well and falls back to
   file-level counts for other languages.

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
    textures.js     procedural facade/window, road/street, sky, ground and star textures
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
- **Infrastructure (DevOps) layer** — the project's runtime footprint is shown
  under the city: a bottom band with **CPU/RAM gauges** and the components
  detected from its manifests (`requirements.txt`, `pyproject.toml`,
  `package.json`, `docker-compose`, `Dockerfile`, SQLite stores), plus a small
  3-D foundation podium with CPU/RAM bars in front of the city. Values are
  static **estimates** from code size + detected dependencies (can be replaced
  by live metrics from the optional local agent).
- **Git-history time-lapse** — when built with `--history`, a timeline in the
  control panel scrubs (or plays) the city growing commit by commit: buildings
  appear as their files are first added and grow toward their final height.
- **Auto-orbit** (⟳) gives a hands-free "city tour" camera.
- **Help tab** (the **?** button, or press <kbd>?</kbd>) explains the metrics
  (NOM / NOA / LOC / DEPS, plus the NOC mix-up) and walks through how to
  analyse a codebase with the tool.

**Query / tag** - the query box (`type:class`, `loc>200`, `lang:ts`,
`district:backend`, or a bare word matching name/file; terms AND-combine)
tints every matching building and dims the rest, and queries can be saved.
Clicking a building lists its members (methods/attributes) for drill-down.

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

Changing a mapping re-lays-out and re-renders the city immediately.

## Notes

- `.codegraph/` and generated models are machine-local; run `build_city.py`
  (scan mode) to regenerate `city.json` anywhere, with no tooling.
- Streets are dependency edges aggregated between buildings (top 2,500 by
  weight, toggleable) and drawn on the ground with pedestrians — they are an
  addition on top of the classic CodeCity metaphor, which only uses positions,
  sizes and colours.
