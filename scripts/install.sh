#!/bin/sh
# Install for the current user; no sudo, Python, compilers, or containers.
set -eu
package_spec=${CODECITY_PACKAGE:-}
node_channel=${CODECITY_NODE_CHANNEL:-lts}
no_launch=${CODECITY_NO_LAUNCH:-0}
case "$node_channel" in lts|current) ;; *) echo 'CODECITY_NODE_CHANNEL must be lts or current.' >&2; exit 1 ;; esac
install_root="${XDG_DATA_HOME:-$HOME/.local/share}/codecity"
bin_root="$HOME/.local/bin"
compatible_node() {
    "$1" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' >/dev/null 2>&1
}
node_exe=$(command -v node || true)
if [ -z "$node_exe" ] || ! compatible_node "$node_exe"; then
    command -v curl >/dev/null || { echo 'curl is required to download Node.' >&2; exit 1; }
    case "$(uname -s)" in Linux) platform=linux ;; Darwin) platform=darwin ;; *) echo 'Use install.ps1 on Windows.' >&2; exit 1 ;; esac
    case "$(uname -m)" in x86_64|amd64) arch=x64 ;; aarch64|arm64) arch=arm64 ;; *) echo 'Supported architectures: x64 and ARM64.' >&2; exit 1 ;; esac
    # Resolve the latest LTS at install time through Node's official download page.
    if [ "$node_channel" = lts ]; then
        release=$(curl --fail --silent --show-error --location https://nodejs.org/dist/index.tab | awk 'NR>1 && $10!="-" {print $1; exit}')
        case "$release" in v[0-9]*.[0-9]*.[0-9]*) ;; *) echo 'Could not resolve the latest Node LTS.' >&2; exit 1 ;; esac
        download_root="https://nodejs.org/dist/$release"
    else download_root=https://nodejs.org/dist/latest; fi
    temp_dir=$(mktemp -d)
    trap 'rm -rf -- "$temp_dir"' EXIT HUP INT TERM
    curl --fail --silent --show-error --location "$download_root/SHASUMS256.txt" -o "$temp_dir/SHASUMS256.txt"
    archive_name=$(awk -v suffix="-$platform-$arch.tar.gz" '$2 ~ suffix"$" {print $2; exit}' "$temp_dir/SHASUMS256.txt")
    case "$archive_name" in node-v*"-$platform-$arch.tar.gz") ;; *) echo 'No compatible official Node archive found.' >&2; exit 1 ;; esac
    curl --fail --silent --show-error --location "$download_root/$archive_name" -o "$temp_dir/$archive_name"
    expected=$(awk -v name="$archive_name" '$2==name {print $1}' "$temp_dir/SHASUMS256.txt")
    if command -v sha256sum >/dev/null; then actual=$(sha256sum "$temp_dir/$archive_name" | awk '{print $1}')
    elif command -v shasum >/dev/null; then actual=$(shasum -a 256 "$temp_dir/$archive_name" | awk '{print $1}')
    else echo 'A SHA-256 tool is required (sha256sum or shasum).' >&2; exit 1; fi
    [ "$actual" = "$expected" ] || { echo 'Node checksum verification failed.' >&2; exit 1; }
    mkdir -p "$install_root/runtime"
    tar -xzf "$temp_dir/$archive_name" -C "$install_root/runtime"
    node_exe="$install_root/runtime/${archive_name%.tar.gz}/bin/node"
    compatible_node "$node_exe" || { echo 'Downloaded Node failed its version check.' >&2; exit 1; }
fi
echo "Using Node $("$node_exe" --version) at $node_exe"
node_dir=$(dirname "$node_exe")
PATH="$node_dir:$PATH"
export PATH
npm_exe=$(command -v npm || true)
[ -n "$npm_exe" ] || { echo 'Node exists but npm is missing. Install the official Node distribution and retry.' >&2; exit 1; }
if [ -z "$package_spec" ]; then
    package_spec=https://codeload.github.com/Amin-Tgz/CodeCity/tar.gz/refs/heads/main
    # A piped script has $0=sh, so it must not guess a checkout from the user's cwd.
    case "$0" in */*)
        checkout=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
        if [ -f "$checkout/package.json" ]; then package_spec=$checkout; fi
    ;; esac
fi
"$npm_exe" install --global --prefix "$install_root/app" --omit=dev --no-audit --no-fund -- "$package_spec"
cli_path="$install_root/app/lib/node_modules/codecity-viewer/server/cli.cjs"
[ -f "$cli_path" ] || { echo 'Installed package is missing the CodeCity launcher.' >&2; exit 1; }
mkdir -p "$bin_root"
# Quote arbitrary user paths for the generated shell launcher.
quote_path() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }
{ printf '#!/bin/sh\nexec '; quote_path "$node_exe"; printf ' '; quote_path "$cli_path"; printf ' "$@"\n'; } > "$bin_root/codecity"
chmod +x "$bin_root/codecity"
echo "CodeCity installed. Run: $bin_root/codecity"
case ":$PATH:" in *":$bin_root:"*) ;; *) echo "Add $bin_root to your PATH to use the command 'codecity'." ;; esac
if [ "$no_launch" != 1 ]; then exec "$node_exe" "$cli_path"; fi
