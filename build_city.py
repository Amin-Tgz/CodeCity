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
import ast
import json
import os
import re
import sqlite3
import subprocess
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
RE_JS_CLASS = re.compile(r"^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)")
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


def _js_mask(text: str) -> str:
    """Hide strings/comments while preserving offsets and line boundaries."""
    pattern = r"//[^\n]*|/\*.*?\*/|([\"'`])(?:\\.|(?!\1).)*\1"
    return re.sub(pattern, lambda m: ''.join('\n' if c == '\n' else ' ' for c in m.group()), text, flags=re.S)


def _extract_attributes(text: str, language: str) -> int:
    """Estimate declared/assigned fields; method calls are not attributes."""
    names: set[str] = set()
    if language == "python":
        names = set(re.findall(r"\bself\.([A-Za-z_]\w*)\s*(?::[^=\n]+)?\s*=(?!=)", text))
    elif language in ("typescript", "javascript", "vue", "svelte"):
        names = set(re.findall(r"\bthis\.([A-Za-z_$][\w$]*)\s*=(?!=|>)", text))
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
        if not p.is_file():
            raise SystemExit(f"codegraph database does not exist: {p}")
        return p
    for cand in (root / ".codegraph" / "codegraph.db",):
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
                attrs = max(_extract_attributes(body, lang), props)
                name = c['name']
                if sum(n['name'] == name for n in classes) > 1:
                    name = c['qualified_name'] or f"{name}@{c['start_line']}"
                bid = f"{fp}::{name}"
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
                    "attributes": attrs,
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
                "attributes": len(vars_),
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
    file_rel_to_abs: dict[str, Path] = {}

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS and not d.startswith("."))
        for fn in sorted(filenames):
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


def _scan_python(rel: str, text: str) -> list[dict]:
    """Use Python's parser for scope boundaries, async methods and members."""
    try:
        tree = ast.parse(text)
    except SyntaxError:
        # Incomplete or version-incompatible files still get a module estimate.
        funcs = len(re.findall(r"^(?:async\s+)?def\s+\w+", text, re.M))
        return [_mk(rel, Path(rel).name, "module", "python", _count_lines(text), 0, 0, funcs, 1)]

    functions = (ast.FunctionDef, ast.AsyncFunctionDef)
    out = []

    class Classes(ast.NodeVisitor):
        def __init__(self):
            self.scope = []

        def visit_ClassDef(self, node):
            name = ".".join([*self.scope, node.name])
            methods = [n for n in node.body if isinstance(n, functions)]
            attrs = set()
            def own_nodes(n):
                yield n
                for child in ast.iter_child_nodes(n):
                    if not isinstance(child, ast.ClassDef):
                        yield from own_nodes(child)

            for n in own_nodes(node):
                if isinstance(n, ast.Attribute) and isinstance(n.ctx, ast.Store) and isinstance(n.value, ast.Name) and n.value.id == 'self':
                    attrs.add(n.attr)
            for n in node.body:
                targets = n.targets if isinstance(n, ast.Assign) else [n.target] if isinstance(n, ast.AnnAssign) else []
                for target in targets:
                    attrs.update(x.id for x in ast.walk(target) if isinstance(x, ast.Name) and isinstance(x.ctx, ast.Store))
            b = _mk(rel, node.name, "class", "python", node.end_lineno - node.lineno + 1,
                    len(methods), len(attrs), 0, node.lineno)
            b['id'] = f"{rel}::{name}"
            b['members'] = [{"name": m.name, "kind": "method", "loc": m.end_lineno - m.lineno + 1, "line": m.lineno} for m in methods]
            b['members'] += [{"name": a, "kind": "property", "loc": 1, "line": node.lineno} for a in sorted(attrs)]
            out.append(b)
            self.scope.append(node.name)
            self.generic_visit(node)
            self.scope.pop()

        def visit_FunctionDef(self, node):
            self.scope.append(node.name)
            self.generic_visit(node)
            self.scope.pop()

        visit_AsyncFunctionDef = visit_FunctionDef

    Classes().visit(tree)
    funcs = [n for n in tree.body if isinstance(n, functions)]
    variables = set()
    for n in tree.body:
        targets = n.targets if isinstance(n, ast.Assign) else [n.target] if isinstance(n, ast.AnnAssign) else []
        for target in targets:
            variables.update(x.id for x in ast.walk(target) if isinstance(x, ast.Name) and isinstance(x.ctx, ast.Store))
    if not out or funcs or variables:
        class_lines = sum(n.end_lineno - n.lineno + 1 for n in tree.body if isinstance(n, ast.ClassDef))
        b = _mk(rel, Path(rel).name, "module", "python", max(1, _count_lines(text) - class_lines), 0, len(variables), len(funcs), 1)
        b['members'] = [{"name": f.name, "kind": "function", "loc": f.end_lineno - f.lineno + 1, "line": f.lineno} for f in funcs]
        out.append(b)
    return out


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
        return _scan_python(rel, text)
    elif lang in ("typescript", "javascript", "vue", "svelte"):
        i = 0
        class_count = 0
        masked_lines = _js_mask(text).splitlines()
        module_lines = lines.copy()
        while i < len(lines):
            m = RE_JS_CLASS.match(masked_lines[i])
            if m:
                end = _js_class_body_range(masked_lines, i)
                body = '\n'.join(masked_lines[i:end])
                methods = 0
                fields = set()
                depth = 0
                members = []
                for offset, line in enumerate(masked_lines[i:end]):
                    if depth == 1:
                        method = re.match(r'^\s*(?:(?:public|private|protected|static|async|get|set|override|abstract)\s+)*\*?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\([^;]*?\)\s*(?::[^{;]+)?\s*(?:\{|;)', line)
                        field = re.match(r'^\s*(?:(?:public|private|protected|readonly|static|declare)\s+)*([A-Za-z_$#][\w$#]*)[?!]?\s*[:=;]', line)
                        if method:
                            methods += 1
                            members.append({'name': method.group(1), 'kind': 'method', 'loc': 1, 'line': i + offset + 1})
                        elif field:
                            fields.add(field.group(1))
                    depth += line.count('{') - line.count('}')
                fields.update(re.findall(r'\bthis\.([A-Za-z_$#][\w$#]*)\s*=(?!=|>)', body))
                attrs = len(fields)
                out.append(_mk(rel, m.group(1), "class", lang, end - i, methods,
                               attrs, 0, i + 1))
                out[-1]['members'] = members
                out[-1]['members'] += [{'name': name, 'kind': 'property', 'loc': 1, 'line': i + 1} for name in sorted(fields)]
                module_lines[i:end] = [''] * (end - i)
                class_count += 1
                i = end
            else:
                i += 1
        module_text = '\n'.join(module_lines)
        funcs = sum(1 for line in module_lines if RE_JS_FUNC.match(line))
        mod_vars = len(re.findall(r"^(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*", module_text, re.M))
        if class_count == 0 or funcs or mod_vars:
            module_loc = total_lines if class_count == 0 else sum(bool(line.strip()) for line in module_lines)
            out.append(_mk(rel, os.path.basename(rel), "module", lang, module_loc,
                          0, mod_vars, funcs, 1))
    else:
        funcs = sum(1 for line in lines if RE_GENERIC_FUNC.match(line))
        mod_vars = len(re.findall(r"^\s*(?:static\s+)?(?:const|final|var|let)\s+\w+", text, re.M))
        out.append(_mk(rel, os.path.basename(rel), "module", lang, total_lines,
                      0, mod_vars, funcs, 1))
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
        "attributes": attrs,
        "functions": funcs,
        "start_line": start,
        "members": [],
    }


def _resolve_imports(rel, text, lang, known):
    targets = set()
    if lang == "python":
        try:
            tree = ast.parse(text)
        except SyntaxError:
            return targets

        def resolve(module):
            stem = module.replace('.', '/')
            for suffix in ('.py', '.pyi', '/__init__.py', '/__init__.pyi'):
                candidate = stem + suffix
                if candidate in known:
                    targets.add(candidate)
                    return

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    resolve(alias.name)
            elif isinstance(node, ast.ImportFrom):
                base = node.module or ''
                if node.level:
                    parts = list(Path(rel).parent.parts)
                    if node.level > len(parts):
                        continue
                    base = '.'.join(parts[:len(parts) - node.level + 1] + ([base] if base else []))
                resolve(base)
                for alias in node.names:
                    if alias.name != '*':
                        resolve('.'.join(filter(None, (base, alias.name))))
    elif lang in ("typescript", "javascript", "vue", "svelte"):
        base = os.path.dirname(rel)
        for m in re.finditer(r"""(?:from\s+|import\s*|(?:require|import)\(\s*)['"](\.[^'"]+)['"]""", text):
            spec = m.group(1)
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
    buildings = sorted((b for b in buildings if b["loc"] > 0), key=lambda b: (b['file'], b['start_line'], b['id']))
    roads = sorted(roads, key=lambda r: (-r['weight'], r['a'], r['b'], r['kind']))

    # canonical CodeCity metrics: NOM -> height, NOA -> footprint
    for b in buildings:
        if b["kind"] == "class":
            b["nom"] = b["methods"]
            b["noa"] = b["attributes"]
        else:
            b["nom"] = b["functions"]
            b["noa"] = b["attributes"]

    degrees = defaultdict(int)
    for road in roads:
        degrees[road['a']] += road['weight']
        degrees[road['b']] += road['weight']
    for b in buildings:
        b['deps'] = degrees[b['id']]

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

# ---------------------------------------------------------------------------
# infrastructure scan (DevOps layer): services + CPU/RAM estimates
# ---------------------------------------------------------------------------

HEAVY = ("torch", "transformers", "tensorflow", "onnxruntime", "chromadb", "llama",
         "sentence-transformers", "accelerate", "numpy", "scipy", "pandas", "faiss")
DB = ("sqlite", "psycopg", "asyncpg", "pymongo", "redis", "mysql", "sqlalchemy",
      "alembic", "duckdb", "chromadb")
WEB = ("fastapi", "uvicorn", "flask", "django", "starlette", "gunicorn", "httpx", "aiohttp")
FRONT = ("react", "next", "vue", "svelte", "express", "vite", "typescript", "tailwind", "eslint")


def _classify(name: str) -> str:
    n = name.lower()
    if any(k in n for k in HEAVY):
        return "ai/compute"
    if any(k in n for k in DB):
        return "database"
    if any(k in n for k in WEB):
        return "web"
    if any(k in n for k in FRONT):
        return "frontend"
    if any(k in n for k in ("docker", "compose", "container")):
        return "container"
    return "dependency"


def _dep_name(raw: str) -> str:
    raw = raw.strip().strip('"\'')
    if not raw or raw.startswith(("#", "-")):
        return ""
    return re.split(r"[<>=!~\[; (]", raw)[0].strip()


def scan_infra(root: Path, model: dict) -> dict:
    services: list[dict] = []
    seen: set[tuple[str, str]] = set()

    def add(name: str, category: str, source: str):
        name = (name or "").strip()
        if not name:
            return
        key = (name.lower(), category)
        if key in seen:
            return
        seen.add(key)
        services.append({"name": name, "category": category, "source": source})

    SKIP = SKIP_DIRS

    def find(pred, maxdepth=5):
        hits = []
        for dp, dirs, files in os.walk(root):
            rel = Path(dp).relative_to(root)
            if len(rel.parts) >= maxdepth:
                dirs[:] = []
            dirs[:] = [d for d in dirs if d not in SKIP]
            for f in files:
                if pred(f):
                    hits.append(Path(dp) / f)
        return hits

    def read(p: Path) -> str:
        try:
            return p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return ""

    def src(p: Path) -> str:
        try:
            return str(p.relative_to(root))
        except Exception:
            return p.name

    for p in find(lambda f: f.startswith("requirements") and f.endswith(".txt")):
        for line in read(p).splitlines():
            n = _dep_name(line)
            if n:
                add(n, _classify(n), src(p))

    for p in find(lambda f: f == "pyproject.toml"):
        pyt = read(p)
        for m in re.finditer(r'^\s*"([A-Za-z0-9_.\-]+)\s*[<>=~!]', pyt, re.M):
            add(m.group(1), _classify(m.group(1)), src(p))
        for m in re.finditer(r"^\s*([A-Za-z0-9_.\-]+)\s*=\s*[\"']?[\^~>=]", pyt, re.M):
            add(m.group(1), _classify(m.group(1)), src(p))

    for p in find(lambda f: f == "package.json"):
        try:
            pkg = json.loads(read(p) or "{}")
        except Exception:
            continue
        for bucket in ("dependencies", "devDependencies"):
            for name in (pkg.get(bucket) or {}):
                add(name, _classify(name), src(p))

    for p in find(lambda f: f.startswith("docker-compose") or f.startswith("compose.")):
        text = read(p)
        block = re.search(r"^services:\s*$(.*?)(^\S|\Z)", text, re.M | re.S)
        if block:
            for m in re.finditer(r"^ {2}([A-Za-z0-9_.\-]+):", block.group(1), re.M):
                add(m.group(1), "container", src(p))

    for p in find(lambda f: f == "Dockerfile" or f.startswith("Dockerfile.")):
        for m in re.finditer(r"^\s*FROM\s+([^\s]+)", read(p), re.M | re.I):
            add(m.group(1), "container", src(p))

    # databases / stores present as files
    for name in ("chat_history.db", "settings.db", "manual_faq.db", "products.db", "parents.db"):
        if (root / "backend" / "data" / name).exists() or (root / "data" / name).exists():
            add(name, "database", "sqlite")

    # ---- estimates ----
    t = model["meta"]["totals"]
    loc = t["loc"]
    heavy = sum(1 for s in services if s["category"] == "ai/compute")
    dbn = sum(1 for s in services if s["category"] == "database")
    containers = sum(1 for s in services if s["category"] == "container")

    def clamp01(x):
        return 0.0 if x < 0 else 1.0 if x > 1 else x

    cpu_score = clamp01(loc / 40000 * 0.55 + t["roads"] / 1500 * 0.3 + containers / 6 * 0.15)
    ram_score = clamp01(t["attributes"] / 1500 * 0.35 + t["buildings"] / 500 * 0.2
                        + heavy / 6 * 0.35 + dbn / 6 * 0.1)
    return {
        "cpu": {
            "score": round(cpu_score, 3),
            "pct": round(cpu_score * 100),
            "estimate": f"{round(cpu_score * 4 + 0.5, 1)} vCPU under load",
        },
        "ram": {
            "score": round(ram_score, 3),
            "pct": round(ram_score * 100),
            "estimate": f"{round(ram_score * 8192)} MB resident",
        },
        "services": services,
        "totals": {"loc": loc, "buildings": t["buildings"], "roads": t["roads"], "heavy_deps": heavy},
        "note": "Static estimates from code size + detected manifests; not measured runtime usage.",
    }


def scan_history(root: Path, max_frames: int = 48) -> dict | None:
    """Per-commit net line counts per file (a cheap LOC proxy) from `git log`.

    Returns {frames:[{hash,t,files,total}]} or None when git is unavailable.
    """
    try:
        out = subprocess.check_output(
            ["git", "-c", "core.quotepath=false", "-C", str(root), "log", "--reverse", "--no-merges", "--no-renames",
             "--pretty=format:@@%H%x09%at", "--numstat"],
            text=True, errors="ignore", stderr=subprocess.DEVNULL,
        )
    except Exception:
        return None

    commits: list[dict] = []
    files: dict[str, int] = {}
    cur: dict | None = None
    for line in out.splitlines():
        if line.startswith("@@"):
            if cur is not None:
                cur["files"] = dict(files)
                commits.append(cur)
            h, _, at = line[2:].partition("\t")
            cur = {"hash": h, "t": int(at or 0)}
            continue
        parts = line.split("\t")
        if len(parts) >= 3 and parts[2]:
            file = parts[2]
            if Path(file).suffix.lower() not in LANG_BY_EXT or any(p in SKIP_DIRS for p in Path(file).parts):
                continue
            try:
                a = int(parts[0]); d = int(parts[1])
            except ValueError:
                continue
            count = max(0, files.get(file, 0) + a - d)
            if count:
                files[file] = count
            else:
                files.pop(file, None)
    if cur is not None:
        cur["files"] = dict(files)
        commits.append(cur)

    if not commits:
        return None
    if len(commits) > max_frames:
        step = len(commits) / max_frames
        sampled = [commits[min(len(commits) - 1, int(i * step))] for i in range(max_frames)]
        sampled[-1] = commits[-1]
        commits = sampled
    for c in commits:
        c["total"] = sum(c["files"].values())
    return {"unit": "net lines", "frames": commits}


def load_coverage(root: Path, path: str | None) -> dict | None:
    """Read a generic coverage summary: { "path/file": pct | {pct} }."""
    if not path:
        return None
    p = Path(path)
    if not p.is_absolute():
        p = root / p
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return None
    if not isinstance(data, dict):
        return None

    def pct_of(v):
        if isinstance(v, (int, float)):
            return float(v) / 100 if v > 1 else float(v)
        if isinstance(v, dict):
            for k in ("pct", "lines", "statements", "line"):
                if k in v:
                    x = v[k]
                    if isinstance(x, dict) and "pct" in x:
                        x = x["pct"]
                    if isinstance(x, (int, float)):
                        return float(x) / 100 if k == 'pct' or isinstance(v[k], dict) or x > 1 else float(x)
        return None

    cov = {}
    for k, v in data.items():
        pc = pct_of(v)
        if pc is not None:
            cov[str(k).replace("\\", "/")] = max(0.0, min(1.0, pc))
    return cov


def coverage_for(file: str, cov: dict) -> float | None:
    f = file.replace("\\", "/")
    if f in cov:
        return cov[f]
    for k, v in cov.items():
        if k.endswith('/' + f) or f.endswith('/' + k):
            return v
    return None


def build(root: Path, out: Path, source: str, codegraph_path: str | None,
          history: bool = False, coverage: str | None = None) -> dict:
    root = root.resolve()
    if not root.is_dir():
        raise ValueError(f"codebase root is not a directory: {root}")
    root_name = root.name
    db = find_codegraph(root, codegraph_path) if source in ("auto", "codegraph") else None

    if source == "codegraph" and db is None:
        raise SystemExit(f"no codegraph database found under {root}")
    if source in ("auto", "codegraph") and db is not None:
        print(f"[codecity] source: codegraph  ({db})")
        model = load_from_codegraph(db, root, root_name)
    else:
        print(f"[codecity] source: scan  ({root})")
        model = scan_tree(root, root_name)

    if history:
        hist = scan_history(root)
        if hist:
            model["meta"]["history"] = hist
            print(f"[codecity] history: {len(hist['frames'])} frames")
    cov = load_coverage(root, coverage)
    if cov:
        n = 0
        for b in model["buildings"]:
            c = coverage_for(b["file"], cov)
            if c is not None:
                b["coverage"] = round(c, 4)
                n += 1
        print(f"[codecity] coverage: matched {n} buildings")

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
    ap.add_argument("root", nargs="?", default=str(here),
                    help="repository root to visualise (default: CodeCity directory)")
    ap.add_argument("--out", default=str(here / "city.json"), help="output city.json path")
    ap.add_argument("--source", choices=["auto", "codegraph", "scan"], default="auto")
    ap.add_argument("--codegraph", default=None, help="explicit path to codegraph.db")
    ap.add_argument("--history", action="store_true",
                    help="include a git-history timeline (requires git)")
    ap.add_argument("--coverage", default=None,
                    help="JSON coverage summary {path: pct} to colour by test coverage")
    args = ap.parse_args(argv)

    build(Path(args.root), Path(args.out), args.source, args.codegraph,
          args.history, args.coverage)
    return 0


if __name__ == "__main__":
    sys.exit(main())
