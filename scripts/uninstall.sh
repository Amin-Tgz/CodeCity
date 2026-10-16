#!/bin/sh
# Remove a per-user CodeCity installation created by install.sh.
set -eu
install_root="${XDG_DATA_HOME:-$HOME/.local/share}/codecity"
bin_root="$HOME/.local/bin"
removed=''
for launcher in codecity code-city; do
    if [ -e "$bin_root/$launcher" ]; then
        rm -f -- "$bin_root/$launcher"
        removed="$removed $bin_root/$launcher"
    fi
done
if [ -d "$install_root" ]; then
    rm -rf -- "$install_root"
    removed="$removed $install_root"
fi
if [ -n "$removed" ]; then
    echo "CodeCity uninstalled. Removed:$removed"
else
    echo 'No CodeCity installation was found.'
fi
