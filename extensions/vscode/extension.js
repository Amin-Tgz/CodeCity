const vscode = require('vscode');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

let serverProcess = null;
let serverUrl = null;
let statusBarItem = null;

const LOCALES = [
  ['en', 'English'],
  ['es', 'Español'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['zh', '中文'],
  ['ja', '日本語'],
  ['ar', 'العربية'],
  ['fa', 'فارسی']
];

function resolveProjectRoot(uri) {
  if (uri && uri.fsPath) return uri.fsPath;
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    return workspaceFolders[0].uri.fsPath;
  }
  return null;
}

function startServer(rootPath) {
  return new Promise((resolve, reject) => {
    if (serverProcess && serverUrl) {
      return resolve({ url: serverUrl, process: serverProcess });
    }

    // Use the bundled runtime (packaged .vsix) and fall back to the repo layout for development.
    const cliPath = [
      path.resolve(__dirname, 'runtime', 'server', 'cli.cjs'),
      path.resolve(__dirname, '..', '..', 'server', 'cli.cjs')
    ].find((candidate) => fs.existsSync(candidate));
    if (!cliPath) {
      reject(new Error('CodeCity runtime not found. Reinstall the extension or run npm run package:vscode.'));
      return;
    }
    const child = spawn(process.execPath, [cliPath, '--root', rootPath, '--port', '0', '--no-open'], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });

    let settled = false;

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      const match = text.match(/CodeCity → (http:\/\/127\.0\.0\.1:\d+\/)/);
      if (match && !settled) {
        settled = true;
        serverUrl = match[1];
        serverProcess = child;
        resolve({ url: serverUrl, process: child });
      }
    });

    child.stderr.on('data', (chunk) => {
      console.error(`[CodeCity Error] ${chunk.toString()}`);
    });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    child.on('exit', () => {
      serverProcess = null;
      serverUrl = null;
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Timed out waiting for CodeCity server to start.'));
      }
    }, 12000);
  });
}

function appHref(baseUrl, language) {
  const url = new URL(baseUrl);
  if (language) url.searchParams.set('lang', language);
  return url.toString();
}

function panelHtml(href) {
  return `<!DOCTYPE html>
<html lang="en" style="width:100%;height:100%;margin:0;padding:0;overflow:hidden;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://127.0.0.1:* http://localhost:*; style-src 'unsafe-inline';">
  <title>CodeCity</title>
  <style>
    body, html, iframe { width: 100%; height: 100%; border: none; margin: 0; padding: 0; background: #0c1520; overflow: hidden; }
  </style>
</head>
<body>
  <iframe src="${href}" allow="clipboard-read; clipboard-write; fullscreen"></iframe>
</body>
</html>`;
}

async function openCodeCity(uri, options = {}) {
  let root = options.root || resolveProjectRoot(uri);
  if (!root && options.askForFolder) {
    const picked = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Open CodeCity here'
    });
    if (picked && picked[0]) root = picked[0].fsPath;
  }
  if (!root) {
    vscode.window.showWarningMessage('CodeCity: open a folder or workspace first.');
    return;
  }

  const config = vscode.workspace.getConfiguration('codecity');
  const language = options.language || config.get('language', 'en');
  const target = options.preferBrowser ? 'browser' : config.get('target', 'webview');

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'CodeCity: launching the 3D code city…',
      cancellable: false
    },
    async () => {
      try {
        const { url } = await startServer(root);
        const href = appHref(url, language);

        if (target === 'browser') {
          vscode.env.openExternal(vscode.Uri.parse(href));
          return;
        }

        const panel = vscode.window.createWebviewPanel(
          'codecityViewer',
          `CodeCity: ${path.basename(root)}`,
          vscode.ViewColumn.One,
          {
            enableScripts: true,
            retainContextWhenHidden: true
          }
        );
        panel.webview.html = panelHtml(href);
      } catch (err) {
        vscode.window.showErrorMessage(`CodeCity launch failed: ${err.message}`);
      }
    }
  );
}

class HomeViewProvider {
  constructor(context) {
    this.context = context;
  }

  resolveWebviewView(view) {
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html();
    view.webview.onDidReceiveMessage(async (message) => {
      if (message && message.type === 'open') {
        if (message.language) {
          await vscode.workspace
            .getConfiguration('codecity')
            .update('language', message.language, vscode.ConfigurationTarget.Global);
        }
        await openCodeCity(undefined, {
          language: message.language,
          preferBrowser: message.target === 'browser',
          askForFolder: true
        });
      }
    });
  }

  html() {
    const config = vscode.workspace.getConfiguration('codecity');
    const language = config.get('language', 'en');
    const target = config.get('target', 'webview');
    const root = resolveProjectRoot();
    const project = root ? path.basename(root) : null;
    const nonce = crypto.randomBytes(16).toString('base64');
    const options = LOCALES
      .map(([value, label]) => `<option value="${value}"${value === language ? ' selected' : ''}>${label}</option>`)
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 12px; }
    h2 { margin: 0 0 6px; font-size: 1.1em; }
    p { margin: 6px 0; line-height: 1.4; }
    label { display: block; margin: 10px 0 2px; opacity: .85; }
    select, button { width: 100%; box-sizing: border-box; padding: 5px; border-radius: 4px;
      border: 1px solid var(--vscode-dropdown-border, transparent); background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); }
    button { margin-top: 14px; border: none; cursor: pointer; padding: 7px;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .muted { opacity: .7; }
  </style>
</head>
<body>
  <h2>CodeCity</h2>
  <p>${project
    ? `Open CodeCity in <b>${escapeHtml(project)}</b>?`
    : 'Open a folder to explore it as a 3D code city.'}</p>
  <label for="lang">Language</label>
  <select id="lang">${options}</select>
  <label for="target">Open in</label>
  <select id="target">
    <option value="webview"${target === 'webview' ? ' selected' : ''}>VS Code tab</option>
    <option value="browser"${target === 'browser' ? ' selected' : ''}>External browser</option>
  </select>
  <button id="open">Open CodeCity</button>
  <p class="muted" id="status"></p>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('open').addEventListener('click', () => {
      document.getElementById('status').textContent = 'Launching…';
      vscode.postMessage({
        type: 'open',
        language: document.getElementById('lang').value,
        target: document.getElementById('target').value
      });
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function activate(context) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'codecity.open';
  statusBarItem.text = '$(globe) CodeCity';
  statusBarItem.tooltip = 'CodeCity: explore the workspace as an interactive 3D city';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('codecity.open', (uri) => openCodeCity(uri, {})),
    vscode.commands.registerCommand('codecity.openInBrowser', (uri) => openCodeCity(uri, { preferBrowser: true })),
    vscode.window.registerWebviewViewProvider('codecity.home', new HomeViewProvider(context), {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );
}

function deactivate() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
    serverUrl = null;
  }
}

module.exports = {
  activate,
  deactivate
};
