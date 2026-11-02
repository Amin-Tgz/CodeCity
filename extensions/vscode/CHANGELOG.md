# Changelog

All notable changes to the CodeCity VS Code extension are documented here.

## 0.4.2

- Open the viewer immediately while the initial project scan runs, avoiding the
  extension startup timeout on large projects. Display analysis failures in the viewer.
- Bound JavaScript/TypeScript compiler analysis to 256 files / 4 MiB. Larger
  projects retain syntax metrics and local module references, with a scan warning
  explaining that compiler-resolved call edges are unavailable.
- Buffer split UTF-8 startup messages, report early process exits, and terminate
  failed or pending launches when they time out or the extension deactivates.
- Reuse pending launches for the same folder and keep different folders in
  separate server sessions.

## 0.4.1

- Selecting a building now highlights its dependencies instead of fading the
  rest of the city. Unrelated buildings stay solid, so a click no longer turns
  the neighbourhood into a ghostly point cloud (worst on 500+ building cities).
- Adds a Playwright regression test covering the small and instanced paths.
- Documentation: the Marketplace listing and the Extensions-view search path are
  stated in the READMEs.

## 0.4.0

- Integrated 3D code city view in a VS Code editor tab.
- CodeCity activity-bar view with a project prompt, language and open-target selection.
- Interface languages: English, Spanish, French, German, Chinese, Japanese, Arabic and Persian.
- Open the selected building or member in VS Code, Cursor, or the system default editor.
- Bundled analysis runtime: works offline with no compilers or project dependencies.
- Metrics, Git history, comparison, exclusions and source preview.
- MIT license.
