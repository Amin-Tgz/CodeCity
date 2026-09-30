#!/usr/bin/env python3
"""build_city.py - turn a codebase into a CodeCity model (city.json).

CodeCity metaphor (Wettel & Lanza, 2007):
    * classes            -> buildings
    * packages / folders -> districts
    * number of methods  -> building height   (NOM)
    * number of attributes -> building footprint (NOA)
    * lines of code      -> building colour   (LOC)
    * imports / calls    -> roads between buildings

Two data sources, tried in order:

  1. ``--source codegraph`` (default ``auto``): reads a CodeGraph SQLite index
     (``.codegraph/codegraph.db``) if one exists. Gives accurate classes,
     methods, attributes and dependency edges for the indexed repository.
  2. ``--source scan``: a dependency-free source scanner that walks the tree
     and estimates the same metrics with lightweight regexes. Works on any
     folder, no tooling required.

The output is a single ``city.json`` consumed by the three.js viewer.

Usage:
    python build_city.py                       # auto: codegraph DB if present, else scan
    python build_city.py D:\\some\\project
    python build_city.py --source scan --root .. --out city.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
from collections import defaultdict
from pathlib import Path

# ---------------------------------------------------------------------------
# configuration
# ---------------------------------------------------------------------------

SKIP_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "__pycache__", ".venv", ".venv-win",
    "venv", "env", ".mypy_cache", ".pytest_cache", ".ruff_cache", "dist",
    "build", ".next", "out", ".idea", ".vscode", ".codegraph", ".codeboarding",
    ".cluster-out", "test-results", "playwright-report", "site-packages",
    "bundle", "bundle-linux", "installer_source", "coverage", ".cache",
    "vendor", "third_party", "thirdparty", ".playwright-mcp", ".tox", "target",
    "bin", "obj", ".angular", ".gradle", ".terraform", ".opencode",
}

LANG_BY_EXT = {
    ".py": "python",
    ".pyi": "python",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".java": "java",
    ".kt": "kotlin",
    ".go": "go",
    ".rs": "rust",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "csharp",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".hpp": "cpp",
    ".swift": "swift",
    ".scala": "scala",
    ".vue": "vue",
    ".svelte": "svelte",
}

MAX_FILE_BYTES = 2_000_000
MAX_ROADS = 2500

# regexes used by the scanner / attribute estimation
RE_PY_CLASS = re.compile(r"^(\s*)class\s+([A-Za-z_]\w*)")
RE_PY_DEF = re.compile(r"^(\s*)def\s+([A-Za-z_]\w*)\s*\(")
RE_JS_CLASS = re.compile(r"^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)")
RE_JS_FUNC = re.compile(
    r"^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|"
    r"^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>"
)
# generic "function-ish" markers for unknown languages
RE_GENERIC_FUNC = re.compile(
    r"^\s*(?:public|private|protected|static|async|final|export|fun|def|func|fn)\s+"
    r"[A-Za-z_]\w*\s*\(|^\s*(?:function|def|func|fn)\s+[A-Za-z_]\w*"
)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def norm_path(p: str) -> str:
    return p.replace("\\", "/").strip("/")


def language_of(path: str) -> str:
    return LANG_BY_EXT.get(Path(path).suffix.lower(), "other")


def dirname_of(path: str) -> str:
    d = os.path.dirname(norm_path(path))
    return d or "."


def district_label(dirpath: str, root_name: str) -> str:
    if dirpath in (".", ""):
        return root_name
    return dirpath


def _read(path: Path) -> str:
    try:
        if path.stat().st_size > MAX_FILE_BYTES:
            return ""
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _count_lines(text: str) -> int:
    if not text:
        return 0
    return text.count("\n") + (0 if text.endswith("\n") else 1)


def _js_class_body_range(lines: list[str], start: int) -> int:
    """Return the end index (exclusive) of a JS/TS class starting at line `start`."""
    depth = 0
    seen_open = False
    for i in range(start, min(len(lines), start + 4000)):
        for ch in lines[i]:
            if ch == "{":
                depth += 1
                seen_open = True
            elif ch == "}":
                depth -= 1
                if seen_open and depth <= 0:
                    return i + 1
    return min(len(lines), start + 4000)


def _extract_attributes(text: str, language: str) -> int:
    """Count distinct attribute/field names mentioned in a chunk of source."""
    names: set[str] = set()
    if language == "python":
        names = set(re.findall(r"\bself\.([A-Za-z_]\w*)", text))
    elif language in ("typescript", "javascript", "vue", "svelte"):
        names = set(re.findall(r"\bthis\.([A-Za-z_$][\w$]*)", text))
        # class field declarations: "  field: Type" / "  field = value"
        for line in text.splitlines():
            m = re.match(r"^\s{2,}(?:public |private |protected |readonly |static )*"
                         r"([A-Za-z_$][\w$]*)\s*[:=]", line)
            if m:
                names.add(m.group(1))
    else:
        names = set(re.findall(r"\bthis\.([A-Za-z_]\w*)", text))
        if not names:
            for line in text.splitlines():
                m = re.match(r"^\s{2,}(?:public |private |protected |static |readonly )*"
                             r"([A-Za-z_]\w*)\s*[:=]", line)
                if m:
                    names.add(m.group(1))
    # drop common noise
    names.discard("")
    return len(names)


# ---------------------------------------------------------------------------
# codegraph source
# ---------------------------------------------------------------------------

def find_codegraph(root: Path, explicit: str | None) -> Path | None:
    if explicit:
        p = Path(explicit)
        return p if p.exists() else None
    for cand in (root / ".codegraph" / "codegraph.db",
                 root.parent / ".codegraph" / "codegraph.db"):
        if cand.exists():
            return cand
    return None


def load_from_codegraph(db: Path, root: Path, root_name: str) -> dict:
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row

    nodes: dict[str, dict] = {}
    for r in conn.execute(
        "select id, kind, name, qualified_name, file_path, language, start_line, end_line "
        "from nodes"
    ):
        nodes[r["id"]] = dict(r)

    children: dict[str, list[str]] = defaultdict(list)
    dep_pairs: list[tuple[str, str, str]] = []
    for r in conn.execute("select source, target, kind from edges"):
        s, t, k = r["source"], r["target"], r["kind"]
        if k == "contains":
            children[s].append(t)
        elif k in ("calls", "instantiates", "references", "extends", "imports"):
            dep_pairs.append((s, t, k))

    file_rows = list(conn.execute("select path, language, size from files"))
    conn.close()

    # group nodes by file
    by_file: dict[str, list[dict]] = defaultdict(list)
    for n in nodes.values():
        if n["file_path"]:
            by_file[norm_path(n["file_path"])].append(n)

    file_langs = {norm_path(r["path"]): r["language"] for r in file_rows}
    file_text_cache: dict[str, str] = {}

    def text_for(fp: str) -> str:
        if fp not in file_text_cache:
            file_text_cache[fp] = _read(root / fp)
        return file_text_cache[fp]

    buildings: list[dict] = []
    node_to_building: dict[str, str] = {}

    for fp, file_nodes in by_file.items():
        lang = file_langs.get(fp) or language_of(fp)
        classes = [n for n in file_nodes if n["kind"] == "class"]
        if classes:
            for c in classes:
                members = [nodes.get(cid) for cid in children.get(c["id"], [])]
                members = [m for m in members if m]
                methods = sum(1 for m in members if m["kind"] == "method")
                props = sum(1 for m in members if m["kind"] in ("property", "variable", "constant"))
                loc = max(1, (c["end_line"] or 0) - (c["start_line"] or 0) + 1)
                body = ""
                if c["start_line"] or c["end_line"]:
                    lines = text_for(fp).splitlines()
                    body = "\n".join(lines[(c["start_line"] or 1) - 1: c["end_line"] or len(lines)])
                attrs = _extract_attributes(body, lang) or props
                bid = f"{fp}::{c['name']}"
                member_list = [
                    {
                        "name": m["name"],
                        "kind": m["kind"],
                        "loc": max(1, (m["end_line"] or 0) - (m["start_line"] or 0) + 1),
                        "line": m["start_line"] or 1,
                    }
                    for m in members
                    if m["kind"] in ("method", "property", "variable", "constant")
                ]
                buildings.append({
                    "id": bid,
                    "name": c["name"],
                    "kind": "class",
                    "file": fp,
                    "district": dirname_of(fp),
                    "language": lang,
                    "loc": loc,
                    "methods": methods,
                    "attributes": max(attrs, 1),
                    "functions": 0,
                    "start_line": c["start_line"] or 1,
                    "members": member_list,
                })
                node_to_building[c["id"]] = bid
                for m in members:
                    node_to_building[m["id"]] = bid
                # methods' own child nodes
                for m in members:
                    for cid in children.get(m["id"], []):
                        node_to_building[cid] = bid
        else:
            # module building (no classes in this file)
            funcs = [n for n in file_nodes if n["kind"] == "function"]
            vars_ = [n for n in file_nodes if n["kind"] in ("variable", "constant", "property")]
            end = max((n["end_line"] or 0) for n in file_nodes) if file_nodes else 0
            loc = end or _count_lines(text_for(fp)) or 1
            name = os.path.basename(fp)
            bid = f"{fp}::{name}"
            member_list = [
                {
                    "name": n["name"],
                    "kind": n["kind"],
                    "loc": max(1, (n["end_line"] or 0) - (n["start_line"] or 0) + 1),
                    "line": n["start_line"] or 1,
                }
                for n in (funcs + vars_)
            ]
            buildings.append({
                "id": bid,
                "name": name,
                "kind": "module",
                "file": fp,
                "district": dirname_of(fp),
                "language": lang,
                "loc": max(1, loc),
                "methods": 0,
                "attributes": max(len(vars_), 1),
                "functions": len(funcs),
                "start_line": 1,
                "members": member_list,
            })
            for n in file_nodes:
                node_to_building[n["id"]] = bid

    # roads: dependency edges between buildings
    weights: dict[tuple[str, str, str], int] = defaultdict(int)
    for s, t, k in dep_pairs:
        a = node_to_building.get(s)
        b = node_to_building.get(t)
        if not a or not b or a == b:
            continue
        key = (a, b, "imports" if k == "imports" else "calls")
        weights[key] += 1

    roads = [
        {"a": a, "b": b, "kind": kind, "weight": w}
        for (a, b, kind), w in weights.items()
    ]
    roads.sort(key=lambda r: r["weight"], reverse=True)
    roads = roads[:MAX_ROADS]

    return assemble(buildings, roads, root, root_name, "codegraph", file_langs, len(nodes), len(dep_pairs))


# ---------------------------------------------------------------------------
# source scanner
# ---------------------------------------------------------------------------

def scan_tree(root: Path, root_name: str) -> dict:
    buildings: list[dict] = []
    lang_counter: dict[str, int] = defaultdict(int)
    module_paths: dict[str, str] = {}   # dotted/basename module -> file
    file_rel_to_abs: dict[str, Path] = {}

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for fn in filenames:
            ext = Path(fn).suffix.lower()
            lang = LANG_BY_EXT.get(ext)
            if not lang:
                continue
            abs_p = Path(dirpath) / fn
            try:
                rel = norm_path(str(abs_p.relative_to(root)))
            except ValueError:
                continue
            file_rel_to_abs[rel] = abs_p
            module_paths[rel[:-len(ext)]] = rel
            module_paths[Path(rel).stem] = rel
            lang_counter[lang] += 1
            buildings.extend(_scan_file(rel, abs_p, lang))

    # roads from imports (best effort)
    import_targets: dict[str, set[str]] = defaultdict(set)
    for rel, abs_p in file_rel_to_abs.items():
        lang = language_of(rel)
        text = _read(abs_p)
        for target in _resolve_imports(rel, text, lang, file_rel_to_abs):
            if target != rel:
                import_targets[rel].add(target)

    file_primary: dict[str, str] = {}
    for b in buildings:
        file_primary.setdefault(b["file"], b["id"])

    weights: dict[tuple[str, str], int] = defaultdict(int)
    for src, targets in import_targets.items():
        a = file_primary.get(src)
        if not a:
            continue
        for t in targets:
            b = file_primary.get(t)
            if b and b != a:
                weights[(a, b)] += 1
    roads = [{"a": a, "b": b, "kind": "imports", "weight": w}
             for (a, b), w in weights.items()]
    roads.sort(key=lambda r: r["weight"], reverse=True)

    return assemble(buildings, roads[:MAX_ROADS], root, root_name, "scan", lang_counter, 0, 0)


def _scan_file(rel: str, abs_p: Path, lang: str) -> list[dict]:
    text = _read(abs_p)
    if not text:
        return []
    lines = text.splitlines()
    # skip minified / machine-generated bundles
    if lines and max((len(l) for l in lines[:60]), default=0) > 6000:
        return []
    total_lines = len(lines)
    out: list[dict] = []

    if lang == "python":
        classes = []
        for i, line in enumerate(lines):
            m = RE_PY_CLASS.match(line)
            if m:
                classes.append((i, m.group(1), m.group(2)))
        for idx, (i, indent, name) in enumerate(classes):
            # body extends to the next class at the same/lower indent, or EOF
            end = total_lines
            for j2, indent2, _ in classes[idx + 1:]:
                if len(indent2) <= len(indent):
                    end = j2
                    break
            body = "\n".join(lines[i:end])
            methods = len(re.findall(r"^\s+def\s+\w+\s*\(", body, re.M))
            attrs = _extract_attributes(body, "python")
            out.append(_mk(rel, name, "class", lang, end - i, methods, max(attrs, 1), 0, i + 1))
        if not classes:
            funcs = sum(1 for line in lines if RE_PY_DEF.match(line))
            mod_vars = len(re.findall(r"^[A-Za-z_]\w*\s*(?::[^=]+)?=", text, re.M))
            out.append(_mk(rel, os.path.basename(rel), "module", lang, total_lines,
                          0, max(mod_vars, 1), funcs, 1))
    elif lang in ("typescript", "javascript", "vue", "svelte"):
        i = 0
        class_count = 0
        while i < len(lines):
            m = RE_JS_CLASS.match(lines[i])
            if m:
                end = _js_class_body_range(lines, i)
                body = "\n".join(lines[i:end])
                methods = len(re.findall(
                    r"^\s{2,}(?:public |private |protected |static |async |get |set |\*)*"
                    r"[A-Za-z_$][\w$]*\s*(?:<[^>]*>)?\s*\(", body, re.M))
                attrs = _extract_attributes(body, lang)
                out.append(_mk(rel, m.group(1), "class", lang, end - i, methods,
                               max(attrs, 1), 0, i + 1))
                class_count += 1
                i = end
            else:
                i += 1
        if class_count == 0:
            funcs = sum(1 for line in lines if RE_JS_FUNC.match(line))
            mod_vars = len(re.findall(r"^(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*", text, re.M))
            out.append(_mk(rel, os.path.basename(rel), "module", lang, total_lines,
                          0, max(mod_vars, 1), funcs, 1))
    else:
        funcs = sum(1 for line in lines if RE_GENERIC_FUNC.match(line))
        mod_vars = len(re.findall(r"^\s*(?:static\s+)?(?:const|final|var|let)\s+\w+", text, re.M))
        out.append(_mk(rel, os.path.basename(rel), "module", lang, total_lines,
                      0, max(mod_vars, 1), funcs, 1))
    return out


def _mk(rel: str, name: str, kind: str, lang: str, loc: int, methods: int,
        attrs: int, funcs: int, start: int) -> dict:
    return {
        "id": f"{rel}::{name}",
        "name": name,
        "kind": kind,
        "file": rel,
        "district": dirname_of(rel),
        "language": lang,
        "loc": max(1, loc),
        "methods": methods,
        "attributes": max(1, attrs),
        "functions": funcs,
        "start_line": start,
        "members": [],
    }


def _resolve_imports(rel, text, lang, known):
    targets = set()
    if lang == "python":
        for m in re.finditer(r"^\s*from\s+([\w\.]+)\s+import|^\s*import\s+([\w\.]+)", text, re.M):
            mod = (m.group(1) or m.group(2)).split(".")[0]
            hit = known.get(mod)
            if hit:
                targets.add(hit)
    elif lang in ("typescript", "javascript", "vue", "svelte"):
        base = os.path.dirname(rel)
        for m in re.finditer(r"""from\s+['"](\.[^'"]+)['"]|require\(\s*['"](\.[^'"]+)['"]""", text):
            spec = m.group(1) or m.group(2)
            if not spec:
                continue
            cand = os.path.normpath(os.path.join(base, spec)).replace("\\", "/")
            for suffix in ("", ".ts", ".tsx", ".js", ".jsx", ".mjs",
                           "/index.ts", "/index.tsx", "/index.js"):
                if cand + suffix in known:
                    targets.add(cand + suffix)
                    break
    return targets


# ---------------------------------------------------------------------------
# assembly
# ---------------------------------------------------------------------------

def assemble(buildings, roads, root: Path, root_name: str,
             source: str, languages, node_count: int, edge_count: int) -> dict:
    # drop unreadable / degenerate buildings
    buildings = [b for b in buildings if b["loc"] > 0]

    # canonical CodeCity metrics: NOM -> height, NOA -> footprint
    for b in buildings:
        if b["kind"] == "class":
            b["nom"] = max(b["methods"], 1)
            b["noa"] = max(b["attributes"], 1)
        else:
            b["nom"] = max(b["functions"], 1)
            b["noa"] = max(b["attributes"], 1)

    # districts
    districts: dict[str, dict] = {}
    for b in buildings:
        d = b["district"]
        if d not in districts:
            districts[d] = {
                "id": d,
                "name": district_label(d, root_name),
                "depth": 0 if d in (".", "") else d.count("/") + 1,
                "buildings": 0,
                "loc": 0,
                "methods": 0,
            }
        info = districts[d]
        info["buildings"] += 1
        info["loc"] += b["loc"]
        info["methods"] += b["methods"] + b["functions"]

    lang_hist = defaultdict(int)
    for b in buildings:
        lang_hist[b["language"]] += 1
    lang_hist = dict(sorted(lang_hist.items(), key=lambda kv: kv[1], reverse=True))

    locs = sorted((b["loc"] for b in buildings), reverse=True)
    return {
        "meta": {
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "root": str(root),
            "root_name": root_name,
            "source": source,
            "totals": {
                "buildings": len(buildings),
                "districts": len(districts),
                "roads": len(roads),
                "loc": sum(b["loc"] for b in buildings),
                "methods": sum(b["methods"] + b["functions"] for b in buildings),
                "attributes": sum(b["attributes"] for b in buildings),
                "files": len({b["file"] for b in buildings}),
                "nodes": node_count,
                "edges": edge_count,
            },
            "languages": lang_hist,
            "top_loc": locs[0] if locs else 0,
            "legend": {
                "height": "methods (NOM)",
                "footprint": "attributes (NOA)",
                "color": "lines of code (LOC)",
                "district": "folder / package",
            },
        },
        "districts": sorted(districts.values(), key=lambda d: d["id"]),
        "buildings": buildings,
        "roads": roads,
    }


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def build(root: Path, out: Path, source: str, codegraph_path: str | None) -> dict:
    root = root.resolve()
    root_name = root.name
    db = find_codegraph(root, codegraph_path) if source in ("auto", "codegraph") else None

    if source == "codegraph" and db is None:
        raise SystemExit(f"no codegraph database found under {root}")
    if source == "auto" and db is not None:
        print(f"[codecity] source: codegraph  ({db})")
        model = load_from_codegraph(db, root, root_name)
    else:
        print(f"[codecity] source: scan  ({root})")
        model = scan_tree(root, root_name)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(model, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    t = model["meta"]["totals"]
    print(f"[codecity] wrote {out}  "
          f"({t['buildings']} buildings, {t['districts']} districts, {t['roads']} roads, "
          f"{t['loc']} LOC)")
    return model


def main(argv=None) -> int:
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description="Build a CodeCity model (city.json) from a codebase.")
    ap.add_argument("root", nargs="?", default=str(here.parent),
                    help="repository root to visualise (default: parent of codecity/)")
    ap.add_argument("--out", default=str(here / "city.json"), help="output city.json path")
    ap.add_argument("--source", choices=["auto", "codegraph", "scan"], default="auto")
    ap.add_argument("--codegraph", default=None, help="explicit path to codegraph.db")
    args = ap.parse_args(argv)

    build(Path(args.root), Path(args.out), args.source, args.codegraph)
    return 0


if __name__ == "__main__":
    sys.exit(main())
