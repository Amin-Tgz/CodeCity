# Public-project end-to-end verification — 9 October 2026

The final working tree passes 33 browser checks on each of three public Git
repositories, plus all 42 automated tests. A fresh Node process on a different
port also restores the saved metric profile; unsaved edits do not overwrite it.

| Project | Tested revision | Buildings | Dependency links | History frames | Browser checks |
| --- | --- | ---: | ---: | ---: | ---: |
| [Vue core](https://github.com/vuejs/core) | `4ab865a848a1da3d10fb674f857e5fff13094644` | 868 | 2,787 | 13 | 33 passed |
| [Django](https://github.com/django/django) | `7f48e266a83110d62ffb4663d72c9e347db75a9b` | 11,650 | 10,890 | 13 | 33 passed |
| [OpenCV](https://github.com/opencv/opencv) | `07e29c2ac4281bccdebedd9081a99ac48fcef2d5` | 18,012 | 10,972 | 14 | 33 passed |

The repositories were scanned locally without building or executing their code.
Their pinned checkouts have shallow history extended from the public remotes;
this verifies multiple commits, rather than each repository's entire history.
Dependency-link counts describe the model; some links cannot be drawn as streets
because of terraces or the drawing budget.

The browser checks open each project through the folder dialog, validate and
render its full city, change metric mappings, save defaults and reload, select
a real building, preview source, inspect metric evidence, use Advanced search,
district filtering and queries, and verify that Simple clears hidden filters.
They play and pause Git history, switch modes during playback, load an actual
commit structure, compare it with the current model, and restore the current city.
They also check Persian button tooltips, every help translation, diagrams and
the Persian footer, a 390 × 844 mobile viewport, and closing the project. No
browser JavaScript runtime errors occurred in the passing runs.

OpenCV exposed an 80 MB commit-inspection failure caused by buffering all Git
blobs together. The fix parses responses incrementally, skips oversized files
and formats the scanner always rejects, discards binary content, and retains
only source text. Limits remain bounded: 2 MB per file, 128 MB retained source,
256 MB transferred objects, 20,000 candidate files, and a 30-second object-read
timeout. The bundled analysis worker was rebuilt. The regression test includes
over 80 MB of binary assets, empty files, an unknown-language source file,
repeated object IDs, and read/source limits.

The full browser flows for all three projects were rerun after that fix. On
this Windows machine with Node 22.13.1 and Playwright CLI, they took approximately
68 seconds (Vue), 96 seconds (Django), and 164 seconds (OpenCV), including browser
actions and screenshots. These are workflow durations, not controlled benchmarks.

The reusable flow is `tests/browser_public_projects.js`. It accepts a Playwright
page connected to an isolated CodeCity server, a clone path, and a project name.
Use a separate `stateFile` when creating the test server to avoid changing the
user's profile or recent projects. `npm test` runs the automated regression
suite; `npm run build:parsers` rebuilds the shipped analysis worker after changes
to scanner or history code.

Local evidence is retained under ignored directories:

- `output/e2e/{vue,django,opencv}.json`: checks and model totals.
- `output/e2e/{vue,django,opencv}.log`: full Playwright execution results.
- `output/e2e/restart.log`: fresh-process profile verification.
- `output/playwright/{vue,django,opencv}-simple.png`: rendered desktop cities.
- `output/playwright/{vue,django,opencv}-simple-fa-mobile.png`: Persian mobile views.
