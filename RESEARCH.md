# Real-project investigation — 7 October 2026

The duplicate-building failure reproduced on all three repositories. After
the fixes, each model passes the viewer's validation and opens in the 3D app.
OpenCV's file connection count rises from 7,896 to 10,972 (3,076 additional
connections, about 39%). This measures represented connections, not verified
compiler call-graph accuracy.

## Repositories and method

Shallow clones are retained in `output/research/projects/`. Project code was
not built or executed. The baseline uses CodeCity commit
`fe6fd01c7f22082caf8bed3aeb81a88b2011d445`; the final scanner uses the working
tree changes accompanying this report. Node 22.13.1 on Windows was used.

| Repository | Checked-out revision |
| --- | --- |
| OpenCV, `4.x` | `07e29c2ac4281bccdebedd9081a99ac48fcef2d5` |
| Django | `7f48e266a83110d62ffb4663d72c9e347db75a9b` |
| Vue core | `4ab865a848a1da3d10fb674f857e5fff13094644` |

Reports are retained as `output/research/{opencv,django,vue}-{before,after}.json`.
They record totals, parser use, duplicate IDs, representative connections,
repository revisions, warnings and dependency diagnostics. The after reports
also include scan timings. Runs overlapped; timings are observations, not a
controlled performance comparison. The Git checkouts contain one shallow
history endpoint and do not exercise long-history performance.

| Project | Baseline validation | Final validation | Buildings before → after | Roads before → after | Final scan |
| --- | --- | --- | ---: | ---: | ---: |
| OpenCV | Duplicate building IDs | Passed | 17,276 → 18,012 | 7,896 → 10,972 | 30.3 s |
| Django | Duplicate building IDs | Passed | 13,013 → 11,650 | 11,168 → 10,890 | 9.8 s |
| Vue | Duplicate building IDs | Passed | 910 → 868 | 2,787 → 2,787 | 3.0 s |

Django and Vue shrink because documentation and snapshot examples are no
longer interpreted as source. Building counts also change with C/C++ syntax
parsing. These counts are not directly comparable estimates of class quality.

## Duplicate failure

The heuristic adapter assigned every repeated declaration in a file the same
ID. Examples include repeated `Foo` in Vue's compiled-script snapshots,
`MyModel` in Django documentation, and conditional/template declarations in
OpenCV's third-party headers. The viewer correctly rejected the resulting
invalid model. Copies in different folders were already meant to be distinct;
all paths now normalize consistently, and repeated normalized input paths
retain the first copy with a warning.

Heuristic declarations now receive occurrence suffixes. C++ types also use
namespace and nested-type names. Historical identity remapping preserves the
suffixes. Known `.txt`, `.rst`, `.snap`, and `.lock` example/document files are
not source candidates, while `CMakeLists.txt` and unknown source extensions
remain supported. All three final full-project reports contain zero duplicate
building IDs.

## C++ findings and changes

The previous adapter used line expressions to approximate classes and methods,
and tried local/root aliases for includes. This missed public headers rooted
under `modules/*/include`, and export macros could be mistaken for class names.

Bundled C/C++ Tree-sitter grammars now identify declarations, namespaces,
nested types, fields, overloads, ranges and literal include directives.
Common export/wrapper annotations are masked without moving source positions;
this is disclosed with medium confidence. Comments and strings containing
fake includes do not create roads. Deep conditional syntax originally caused
a JavaScript traversal stack overflow on OpenCV; iterative traversal fixes it
and a 2,500-level conditional fixture covers the regression.

Include resolution follows quoted file-local paths, optional per-file
compilation database paths, and unique inferred public include roots. File
modules serve as include endpoints. Duplicate header candidates remain
ambiguous instead of choosing an arbitrary class/file. Qt generated UI header
mapping remains supported.

The following actual OpenCV links were absent in the baseline and are present
after the change:

| Including file | Resolved header |
| --- | --- |
| `modules/imgproc/src/filter.dispatch.cpp` | `modules/core/include/opencv2/core/utils/logger.hpp` |
| `modules/imgproc/src/precomp.hpp` | `modules/imgproc/include/opencv2/imgproc.hpp` |
| `modules/core/include/opencv2/core.hpp` | `modules/core/include/opencv2/core/mat.hpp` |

OpenCV contains 17,701 unique C/C++ include references per source file in this
scan: 9,864 resolve, 168 are ambiguous and 7,669 are unresolved. Missing
standard/system headers, generated headers and unconfigured private include
paths contribute to the unresolved count. Examples and candidate paths are
available in the JSON report; detailed JSON events can be enabled with
`CODECITY_TRACE=1`.

When `compile_commands.json` exists at the project root or under `build/`, the
scanner reads `arguments` or `command` to obtain `-I`, `-isystem`, `-iquote`
and `/I` paths, respecting per-file search order and reporting conflicting
configurations. It never executes these commands. A fixture with conflicting
header names validates this behavior. No compilation database was present in
the cloned OpenCV tree, so its measured results use inferred paths. The format
and working-directory semantics come from the [Clang specification](https://clang.llvm.org/docs/JSONCompilationDatabase.html).

## Exclusions

Project settings now support folders, exact files, individual class/module IDs
and path patterns. The UI offers searchable suggestions, detail-panel
shortcuts, staged rules, apply/cancel and restoration by removing a rule.
Patterns can also be supplied before the first scan. Settings persist per
canonical project root alongside the recent-project settings. Exclusion
updates rescan the project, remove dangling edges, recalculate the visible
districts and dependency counts, and invalidate cached historical models.
Snapshots follow Git-detected file renames when applying exclusions.
Source files remain intact.

Browser checks exercised initial patterns, class exclusion, file exclusion,
folder exclusion and restoring all rules. API checks cover reopen/restart
persistence, isolation between projects, invalid paths and obsolete project
requests. A structural-history check confirms that excluding a current class
also excludes it before a detected file rename.

## Validation and remaining limits

All 8 frontend unit checks and 30 server/integration checks pass. The full
Vue, Django and OpenCV models were opened through the actual project dialog,
constructed in WebGL and rendered without duplicate-ID or parser errors.
The Windows executable was built under `output/feedback-release/` and checked
for bundled C/C++ grammar loading, an include road and the exclusions UI asset.

The final OpenCV browser run renders 18,012 buildings. It draws 1,014 streets
and reports 9,958 links without drawn routes; all 10,972 graph edges remain
available in the dependency inspector. Django draws 432 of 10,890 model edges.
The existing drawing budget and routing geometry matter greatly at this scale;
a sparse street view does not imply that every absent street is an unresolved
dependency. Routing results can vary with layout and model changes.

Macro-heavy C++ still needs compiler-assisted analysis for exact active
declarations, templates, inheritance/type usage and call targets. OpenCV has
11,593 low-confidence buildings across the complete mixed-language scan, so
the syntax upgrade should not be treated as full semantic analysis. Include
roads describe file dependencies, not runtime calls. Obtaining a compilation
database is the next useful step for more precise include paths; a subsequent
compiler adapter would be needed for a C++ call/type graph.

Vue's TypeScript path aliases and external package references remain outside
the existing relative-import checker. Python dependencies remain file-level
estimates. Both are disclosed in the UI/README; unresolved counts include
references outside the scanned project and do not measure recall by themselves.

### Windows Git history follow-up

The initial OpenCV timeline was unavailable because Git rejected the checkout
as owned by a different Windows account. CodeCity's folder-specific
`safe.directory` argument used Windows backslashes, which did not match Git's
canonical slash-separated path. Both history and snapshot readers now normalize
that argument. The real OpenCV checkout subsequently reports history as
available with one commit; a regression check covers Windows path formatting.
The research clone used `--depth 1`, so older commits are absent until more
history is fetched. This is separate from the ownership failure.

Reproduction: `npm run audit:project -- PROJECT_PATH REPORT_PATH`. See the
README for clone commands, exclusions syntax and trace setup. Rebuild portable
executables with `node scripts/build-binary.cjs --output-dir output/feedback-release`.
