#!/usr/bin/env python3
"""
codemap — SQLite-backed knowledge graph for codebase navigation.

Indexes the codebase into nodes (files, classes, functions, models, views,
evaluators, URLs) and edges (imports, calls, routes, inherits). Agents and
developers query it to navigate without grepping blindly.

Usage:
    python scripts/codemap.py build          # (re)build the graph from source
    python scripts/codemap.py query <q>      # natural language-ish query
    python scripts/codemap.py show <node>    # show a node and its connections
    python scripts/codemap.py export         # export graph as JSON (for viz)
    python scripts/codemap.py stats          # show graph statistics
"""

import ast
import json
import os
import re
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "codemap.sqlite"
BACKEND_ROOT = Path(__file__).parent.parent / "backend"
FRONTEND_ROOT = Path(__file__).parent.parent / "frontend" / "src"


# =============================================================================
# Schema
# =============================================================================

SCHEMA = """
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,          -- file, class, function, model, view, evaluator, url, policy_type, agent_type
    name TEXT NOT NULL,
    file_path TEXT,
    line_start INTEGER,
    line_end INTEGER,
    description TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}'   -- JSON blob for extra data
);

CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    type TEXT NOT NULL,          -- imports, calls, routes_to, inherits, contains, evaluates, depends_on
    metadata TEXT DEFAULT '{}',
    FOREIGN KEY (source_id) REFERENCES nodes(id),
    FOREIGN KEY (target_id) REFERENCES nodes(id)
);

CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);
"""


# =============================================================================
# Database
# =============================================================================

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=OFF")
    return conn


def init_db(conn: sqlite3.Connection):
    conn.executescript(SCHEMA)
    conn.commit()


def clear_db(conn: sqlite3.Connection):
    conn.execute("DELETE FROM edges")
    conn.execute("DELETE FROM nodes")
    conn.commit()


def add_node(conn, id: str, type: str, name: str, file_path: str = None,
             line_start: int = None, line_end: int = None,
             description: str = "", metadata: dict = None):
    conn.execute(
        "INSERT OR REPLACE INTO nodes (id, type, name, file_path, line_start, line_end, description, metadata) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (id, type, name, file_path, line_start, line_end, description, json.dumps(metadata or {}))
    )


def add_edge(conn, source_id: str, target_id: str, type: str, metadata: dict = None):
    conn.execute(
        "INSERT INTO edges (source_id, target_id, type, metadata) VALUES (?, ?, ?, ?)",
        (source_id, target_id, type, json.dumps(metadata or {}))
    )


# =============================================================================
# Python AST Indexer
# =============================================================================

def index_python_file(conn: sqlite3.Connection, filepath: Path, rel_path: str):
    """Index a Python file: extract classes, functions, imports."""
    try:
        source = filepath.read_text(encoding="utf-8", errors="replace")
        tree = ast.parse(source, filename=str(filepath))
    except (SyntaxError, UnicodeDecodeError):
        return

    file_id = f"file:{rel_path}"
    add_node(conn, file_id, "file", filepath.name, file_path=rel_path)

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            class_id = f"class:{rel_path}:{node.name}"
            # Detect type by class name patterns
            node_type = "class"
            desc = ""
            if node.name.endswith("View") or node.name.endswith("ViewSet"):
                node_type = "view"
            elif node.name.endswith("Evaluator"):
                node_type = "evaluator"
            elif node.name.endswith("Type") and "graphene" in source[:500]:
                node_type = "graphql_type"

            # Get docstring
            if (node.body and isinstance(node.body[0], ast.Expr)
                    and isinstance(node.body[0].value, ast.Constant)):
                desc = str(node.body[0].value.value).strip()[:200]

            add_node(conn, class_id, node_type, node.name,
                     file_path=rel_path, line_start=node.lineno,
                     line_end=node.end_lineno, description=desc)
            add_edge(conn, file_id, class_id, "contains")

            # Check base classes
            for base in node.bases:
                if isinstance(base, ast.Name):
                    add_edge(conn, class_id, f"class:*:{base.id}", "inherits")
                elif isinstance(base, ast.Attribute) and isinstance(base.value, ast.Name):
                    add_edge(conn, class_id, f"class:*:{base.attr}", "inherits")

        elif isinstance(node, ast.FunctionDef) and not isinstance(node, ast.AsyncFunctionDef):
            # Only top-level and class methods that are significant
            if hasattr(node, 'col_offset') and node.col_offset == 0:
                func_id = f"func:{rel_path}:{node.name}"
                add_node(conn, func_id, "function", node.name,
                         file_path=rel_path, line_start=node.lineno,
                         line_end=node.end_lineno)
                add_edge(conn, file_id, func_id, "contains")

        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            if isinstance(node, ast.ImportFrom) and node.module:
                module = node.module
                if module.startswith("zentinelle."):
                    parts = module.split(".")
                    target_path = "/".join(parts) + ".py"
                    add_edge(conn, file_id, f"file:{target_path}", "imports")


# =============================================================================
# Django-specific indexers
# =============================================================================

def index_models(conn: sqlite3.Connection):
    """Extract Django models and their fields."""
    models_dir = BACKEND_ROOT / "zentinelle" / "models"
    if not models_dir.exists():
        return

    for py_file in models_dir.glob("*.py"):
        if py_file.name.startswith("_"):
            continue
        try:
            source = py_file.read_text()
        except Exception:
            continue

        rel_path = str(py_file.relative_to(BACKEND_ROOT.parent))

        # Find TextChoices enums (agent types, policy types, etc.)
        for match in re.finditer(
            r'class (\w+)\(models\.TextChoices\):\s*\n((?:\s+\w+ = .+\n)+)', source
        ):
            enum_name = match.group(1)
            enum_id = f"enum:{rel_path}:{enum_name}"
            choices = re.findall(r"(\w+) = '(\w+)'", match.group(2))
            add_node(conn, enum_id, "enum", enum_name, file_path=rel_path,
                     description=f"Choices: {', '.join(v for _, v in choices)}",
                     metadata={"choices": {k: v for k, v in choices}})

        # Find model classes
        for match in re.finditer(r'class (\w+)\((?:Tracking|models\.Model|[^)]+)\):', source):
            model_name = match.group(1)
            if model_name in ('Meta',):
                continue
            model_id = f"model:{model_name}"
            add_node(conn, model_id, "model", model_name, file_path=rel_path,
                     line_start=source[:match.start()].count('\n') + 1)


def index_urls(conn: sqlite3.Connection):
    """Extract URL patterns and map them to views."""
    url_files = [
        BACKEND_ROOT / "config" / "urls.py",
        BACKEND_ROOT / "zentinelle" / "api" / "urls.py",
        BACKEND_ROOT / "zentinelle" / "proxy" / "urls.py",
    ]
    for url_file in url_files:
        if not url_file.exists():
            continue
        source = url_file.read_text()
        rel_path = str(url_file.relative_to(BACKEND_ROOT.parent))

        # Match path() and re_path() patterns
        for match in re.finditer(r"(?:path|re_path)\(\s*['\"]([^'\"]+)['\"].*?(\w+View|\w+\.as_view)", source):
            pattern = match.group(1)
            view = match.group(2).replace(".as_view", "")
            url_id = f"url:{pattern}"
            add_node(conn, url_id, "url", pattern, file_path=rel_path,
                     description=f"Routes to {view}")
            add_edge(conn, url_id, f"class:*:{view}", "routes_to")


def index_evaluators(conn: sqlite3.Connection):
    """Index policy evaluators and their config schemas."""
    eval_dir = BACKEND_ROOT / "zentinelle" / "services" / "evaluators"
    if not eval_dir.exists():
        return

    for py_file in eval_dir.glob("*.py"):
        if py_file.name.startswith("_") or py_file.name == "base.py":
            continue
        try:
            source = py_file.read_text()
        except Exception:
            continue

        rel_path = str(py_file.relative_to(BACKEND_ROOT.parent))

        # Find evaluator class and its config schema from docstring
        for match in re.finditer(r'class (\w+Evaluator)\(', source):
            name = match.group(1)
            eval_id = f"evaluator:{name}"

            # Extract config schema from docstring
            schema_match = re.search(r'Config schema:\s*\n\s*\{([^}]+)\}', source)
            config_keys = []
            if schema_match:
                config_keys = re.findall(r'"(\w+)"', schema_match.group(1))

            add_node(conn, eval_id, "evaluator", name, file_path=rel_path,
                     line_start=source[:match.start()].count('\n') + 1,
                     metadata={"config_keys": config_keys})

            # Link to PolicyEngine
            add_edge(conn, "class:*:PolicyEngine", eval_id, "evaluates")


def index_nginx(conn: sqlite3.Connection):
    """Index nginx routing."""
    nginx_conf = BACKEND_ROOT.parent / "docker" / "nginx.conf"
    if not nginx_conf.exists():
        return
    source = nginx_conf.read_text()
    rel_path = "docker/nginx.conf"

    for match in re.finditer(r'location\s+(/[^\s{]+)\s*\{[^}]*proxy_pass\s+http://(\w+)', source):
        location = match.group(1)
        upstream = match.group(2)
        url_id = f"nginx:{location}"
        add_node(conn, url_id, "nginx_route", location, file_path=rel_path,
                 description=f"Proxies to {upstream}")


def index_frontend_pages(conn: sqlite3.Connection):
    """Index Next.js page routes."""
    if not FRONTEND_ROOT.exists():
        return

    for page_file in FRONTEND_ROOT.rglob("page.tsx"):
        rel_path = str(page_file.relative_to(BACKEND_ROOT.parent))
        # Derive route from file path: src/app/agents/page.tsx → /agents
        route = "/" + str(page_file.parent.relative_to(FRONTEND_ROOT / "app")).replace("\\", "/")
        if route == "/.":
            route = "/"

        page_id = f"page:{route}"
        add_node(conn, page_id, "page", route, file_path=rel_path,
                 description=f"Next.js page at {route}")


# =============================================================================
# Build
# =============================================================================

def build(conn: sqlite3.Connection):
    """Full rebuild of the knowledge graph."""
    clear_db(conn)
    init_db(conn)

    print("Indexing Python files...")
    backend_zentinelle = BACKEND_ROOT / "zentinelle"
    if backend_zentinelle.exists():
        for py_file in backend_zentinelle.rglob("*.py"):
            if "__pycache__" in str(py_file) or ".venv" in str(py_file):
                continue
            rel_path = str(py_file.relative_to(BACKEND_ROOT.parent))
            index_python_file(conn, py_file, rel_path)

    print("Indexing models...")
    index_models(conn)

    print("Indexing URLs...")
    index_urls(conn)

    print("Indexing evaluators...")
    index_evaluators(conn)

    print("Indexing nginx...")
    index_nginx(conn)

    print("Indexing frontend pages...")
    index_frontend_pages(conn)

    conn.commit()

    # Stats
    node_count = conn.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
    edge_count = conn.execute("SELECT COUNT(*) FROM edges").fetchone()[0]
    print(f"\nGraph built: {node_count} nodes, {edge_count} edges")
    print(f"Database: {DB_PATH}")


# =============================================================================
# Query
# =============================================================================

def query(conn: sqlite3.Connection, q: str):
    """Search nodes by name or description."""
    pattern = f"%{q}%"
    rows = conn.execute(
        "SELECT id, type, name, file_path, line_start, description FROM nodes "
        "WHERE name LIKE ? OR description LIKE ? OR file_path LIKE ? "
        "ORDER BY type, name LIMIT 30",
        (pattern, pattern, pattern)
    ).fetchall()

    if not rows:
        print(f"No results for '{q}'")
        return

    for row in rows:
        loc = f"{row['file_path']}:{row['line_start']}" if row['file_path'] and row['line_start'] else row['file_path'] or ""
        desc = f" — {row['description'][:80]}" if row['description'] else ""
        print(f"  [{row['type']:12s}] {row['name']:40s} {loc}{desc}")


def show(conn: sqlite3.Connection, node_name: str):
    """Show a node and all its connections."""
    # Find node
    row = conn.execute(
        "SELECT * FROM nodes WHERE name = ? OR id = ? OR id LIKE ?",
        (node_name, node_name, f"%:{node_name}")
    ).fetchone()

    if not row:
        # Try fuzzy
        row = conn.execute(
            "SELECT * FROM nodes WHERE name LIKE ?",
            (f"%{node_name}%",)
        ).fetchone()

    if not row:
        print(f"Node '{node_name}' not found")
        return

    print(f"\n  {row['type'].upper()}: {row['name']}")
    if row['file_path']:
        loc = f"{row['file_path']}:{row['line_start']}" if row['line_start'] else row['file_path']
        print(f"  Location: {loc}")
    if row['description']:
        print(f"  {row['description']}")

    # Outgoing edges
    outgoing = conn.execute(
        "SELECT e.type, n.type as node_type, n.name, n.file_path FROM edges e "
        "JOIN nodes n ON e.target_id = n.id WHERE e.source_id = ?",
        (row['id'],)
    ).fetchall()

    # Incoming edges
    incoming = conn.execute(
        "SELECT e.type, n.type as node_type, n.name, n.file_path FROM edges e "
        "JOIN nodes n ON e.source_id = n.id WHERE e.target_id = ?",
        (row['id'],)
    ).fetchall()

    if outgoing:
        print(f"\n  → Outgoing ({len(outgoing)}):")
        for e in outgoing:
            print(f"    --{e['type']}--> [{e['node_type']}] {e['name']}")

    if incoming:
        print(f"\n  ← Incoming ({len(incoming)}):")
        for e in incoming:
            print(f"    <--{e['type']}-- [{e['node_type']}] {e['name']}")


def export_json(conn: sqlite3.Connection):
    """Export graph as JSON for visualization."""
    nodes = [dict(row) for row in conn.execute("SELECT * FROM nodes").fetchall()]
    edges = [dict(row) for row in conn.execute("SELECT * FROM edges").fetchall()]

    graph = {"nodes": nodes, "edges": edges}

    out_path = Path(__file__).parent.parent / "docs" / "codemap.json"
    out_path.write_text(json.dumps(graph, indent=2))
    print(f"Exported to {out_path} ({len(nodes)} nodes, {len(edges)} edges)")


def stats(conn: sqlite3.Connection):
    """Show graph statistics."""
    print("\n  Node types:")
    for row in conn.execute("SELECT type, COUNT(*) as cnt FROM nodes GROUP BY type ORDER BY cnt DESC"):
        print(f"    {row['type']:20s} {row['cnt']:5d}")

    print("\n  Edge types:")
    for row in conn.execute("SELECT type, COUNT(*) as cnt FROM edges GROUP BY type ORDER BY cnt DESC"):
        print(f"    {row['type']:20s} {row['cnt']:5d}")

    total_n = conn.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
    total_e = conn.execute("SELECT COUNT(*) FROM edges").fetchone()[0]
    print(f"\n  Total: {total_n} nodes, {total_e} edges")


# =============================================================================
# CLI
# =============================================================================

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]
    conn = get_db()
    init_db(conn)

    if cmd == "build":
        build(conn)
    elif cmd == "query" and len(sys.argv) > 2:
        query(conn, " ".join(sys.argv[2:]))
    elif cmd == "show" and len(sys.argv) > 2:
        show(conn, sys.argv[2])
    elif cmd == "export":
        export_json(conn)
    elif cmd == "stats":
        stats(conn)
    else:
        print(__doc__)
        sys.exit(1)

    conn.close()


if __name__ == "__main__":
    main()
