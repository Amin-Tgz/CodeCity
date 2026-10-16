// Stage the CodeCity runtime inside the VS Code extension so the packaged
// extension is self-contained and works after installation from a .vsix.
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'extensions', 'vscode', 'runtime');
const entries = [
  ['server', 'server'],
  ['src', 'src'],
  ['vendor', 'vendor'],
  ['assets', 'assets'],
  ['index.html', 'index.html'],
  ['styles.css', 'styles.css']
];

async function sizeOf(dir) {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await sizeOf(target);
    else if (entry.isFile()) total += (await fs.stat(target)).size;
  }
  return total;
}

async function main() {
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });
  for (const [from, to] of entries) {
    await fs.cp(path.join(root, from), path.join(dest, to), { recursive: true });
  }
  const bytes = await sizeOf(dest);
  console.log(`Staged CodeCity runtime into ${path.relative(root, dest)} (${(bytes / 1024 / 1024).toFixed(1)} MB).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
