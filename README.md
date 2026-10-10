<p align="center">
  <img src="assets/codecity.svg" alt="CodeCity logo" width="96">
</p>

# CodeCity

[English](README.md) · [فارسی](README.fa.md)

Explore your codebase as an interactive **3D city**. Classes and modules become
buildings, folders become districts, and dependencies connect them with streets.
CodeCity scans source locally without installing or executing your project's code.

![CodeCity showing a locally scanned project](docs/images/codecity.png)

## Features

- Open mixed-language projects: JavaScript/TypeScript, Python, C/C++, Java, C#, Go, and more.
- Map methods to height, attributes to footprint, and source lines to colour; customize and save defaults.
- Explore members, dependencies, metric evidence, and source previews by selecting buildings.
- Play Git history, inspect past commit structures, and compare them with the current project.
- Start in Simple mode; use Advanced for filters, investigations, and scan diagnostics.
- Choose from eight interface languages, including Persian and Arabic with right-to-left layouts.

Bundled three.js and parsers let the installed app run offline. Git is optional
and needed for history. Metrics and dependency estimates guide source review;
they do not establish code quality or a complete runtime call graph.

## Get started

Requires **Node.js 22.13 or newer**. From a checkout:

```bash
npm start
# Open a project immediately:
npm start -- --root /path/to/project
```

No dependency installation is needed to run the checkout. The launcher opens
your browser; choose **Project → Open project** to select a folder. Drag to
orbit, scroll to zoom, right-drag to pan, and click a building for details.

Run directly from GitHub with Node and npm installed:

```bash
npx --yes --package=https://codeload.github.com/Amin-Tgz/CodeCity/tar.gz/refs/heads/main codecity
```

If Node is missing, use the checkout installer:

```powershell
# Windows
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

```bash
# macOS / Linux
sh scripts/install.sh
```

The installers download and verify a compatible Node runtime when needed.
See the [guide](docs/GUIDE.md) for remote installation, launcher options,
controls, exclusions, metric rules, and analysis limits.

## Development and documentation

```bash
npm test
# Only when refreshing bundled parsers / the analysis worker:
npm ci
npm run build:parsers
```

- [Full guide](docs/GUIDE.md): usage, architecture, browser checks, and benchmarks.
- [Research](docs/RESEARCH.md): real-project analysis and remaining limitations.
- [Review](docs/REVIEW.md): recorded findings and verification.
- [End-to-end results](docs/E2E.md): public-project browser testing.

The city metaphor follows Richard Wettel and Michele Lanza's *Visualizing
Software Systems as Cities* (VISSOFT 2007).
