<p align="center">
  <img src="assets/codecity.svg" alt="CodeCity logo" width="96">
</p>

# CodeCity

[English](README.md) · [فارسی](README.fa.md)

Explore your codebase as an interactive **3D city**. Classes and modules become
buildings and folders become districts. Select a building to illuminate related
buildings and explore its dependencies in an interactive map beside the city.
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

### 1. Global CLI command (Windows, macOS, Linux)
Install globally to launch CodeCity from any terminal using `codecity` or `code-city`:

```bash
npm install -g .
# Or once published: npm install -g codecity-viewer

# Run in any directory:
codecity
# Open current folder directly:
codecity .
# Open any project directory:
codecity /path/to/project
```

Or run directly from a local checkout:

```bash
npm start
# Open a project immediately:
npm start -- --root /path/to/project
```

### 2. VS Code Extension
Explore 3D code cities directly inside Visual Studio Code:
1. Download `codecity-0.4.0.vsix` from [GitHub Releases](https://github.com/Amin-Tgz/CodeCity/releases).
2. Press `Ctrl+Shift+P` in VS Code, choose `Extensions: Install from VSIX...`, and select the package.
3. Click the `$(globe) CodeCity` status bar item or right-click any folder in the File Explorer.

### Key Features and Improvements:
- **Open Project Folder**: Direct topbar action (`📁 Open folder`) to open the project root in your OS file manager.
- **File Manager Bug Fix**: Reliable file and folder reveal on Windows (no hidden windows) and Linux (`xdg-open`).
- **Open in Editor**: Choose your preferred editor (VS Code, Cursor, or System Default) and jump to specific line numbers directly.
- **Show Less / Collapse**: Expand and collapse dependency maps on demand.
- **Active District Filter Breadcrumbs**: Clear active/inactive styling and toggle-off on repeat clicks.
- **Enriched Help Guide**: Interactive visual SVG diagrams of building dimensions, emoji indicators, and navigation cards.

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
To remove a per-user installation, run the matching uninstaller:

```powershell
# Windows
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\uninstall.ps1
```

```bash
# macOS / Linux
sh scripts/uninstall.sh
```

See the [guide](docs/GUIDE.md) for remote installation, launcher options,
uninstall options, controls, exclusions, metric rules, and analysis limits.

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
