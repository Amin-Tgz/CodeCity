const vscode = require('vscode');
const { spawn } = require('node:child_process');
const path = require('node:path');

let serverProcess = null;
let serverUrl = null;
let statusBarItem = null;

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

    const cliPath = path.resolve(__dirname, '..', '..', 'server', 'cli.cjs');
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

async function openCodeCity(uri, preferBrowser = false) {
  const root = resolveProjectRoot(uri);
  if (!root) {
    vscode.window.showWarningMessage('CodeCity: Open a folder or workspace first.');
    return;
  }

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'CodeCity: Launching 3D code city…',
      cancellable: false
    },
    async () => {
      try {
        const { url } = await startServer(root);
        const config = vscode.workspace.getConfiguration('codecity');
        const target = preferBrowser ? 'browser' : config.get('target', 'webview');

        if (target === 'browser') {
          vscode.env.openExternal(vscode.Uri.parse(url));
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

        panel.webview.html = `<!DOCTYPE html>
<html lang="en" style="width:100%;height:100%;margin:0;padding:0;overflow:hidden;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CodeCity</title>
  <style>
    body, html, iframe { width: 100%; height: 100%; border: none; margin: 0; padding: 0; background: #0c1520; overflow: hidden; }
  </style>
</head>
<body>
  <iframe src="${url}" allow="clipboard-read; clipboard-write; fullscreen"></iframe>
</body>
</html>`;
      } catch (err) {
        vscode.window.showErrorMessage(`CodeCity launch failed: ${err.message}`);
      }
    }
  );
}

function activate(context) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'codecity.open';
  statusBarItem.text = '$(globe) CodeCity';
  statusBarItem.tooltip = 'CodeCity: Explore workspace as an interactive 3D city';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('codecity.open', (uri) => openCodeCity(uri, false)),
    vscode.commands.registerCommand('codecity.openInBrowser', (uri) => openCodeCity(uri, true))
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
