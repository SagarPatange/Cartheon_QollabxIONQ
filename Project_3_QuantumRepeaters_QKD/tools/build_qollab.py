"""Build a Qollab-ready copy of the game in qollab_build/.

Qollab runs a JS project as index.html + main.js + main.css with no server: main.css is the only stylesheet,
<script> tags in index.html don't run, and Python modules are imported from JS and called with .callPromising.
This script turns the 9 game pages into one hash-routed page, puts every stylesheet into main.css, copies the
game modules (patching the few places that navigate) and the Python simulator (without the FastAPI/Stim files).

Usage: python3 tools/build_qollab.py [output_dir]
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
GAME_DIR = PROJECT_DIR / "game"
BACKEND_PACKAGE_DIR = PROJECT_DIR / "backend" / "src" / "quantum_bros"
DEFAULT_OUTPUT_DIR = PROJECT_DIR / "qollab_build"

MAX_FILE_COUNT = 100
MAX_FILE_BYTES = 2 * 1024 * 1024
FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');"
PAGE_NAMES = ["start", "level1", "hut", "level2", "qkd", "teleport", "bb84_hut", "steane_block", "teleported_cnot"]
# Shared sheets first, in the order the pages load them; then the page-specific ones.
FIRST_STYLESHEETS = ["world", "towers", "qkd", "bsm_link", "qubit_tower", "settings_panel"]
# Need fastapi, pydantic or stim, none of which install on Qollab.
EXCLUDED_PYTHON_FILES = {"server.py", "api_models.py", "backends/stim_backend.py"}

# Built-copy patches: (file under src/, old text, new text). Each must match, or the build fails.
SOURCE_PATCHES = [
    ("start/start_main.js", "window.location.hash", "globalThis.qollabAnchorHash"),
    ("start/start_main.js", "window.location.href = MAP_STOPS[game.stopIndex].href;",
     "globalThis.qollabNavigate(MAP_STOPS[game.stopIndex].href);"),
    ("start/start_main.js", 'window.history.replaceState(null, "", buildMapHash(game.stopIndex));',
     'window.history.replaceState(null, "", globalThis.qollabToHash(`start.html${buildMapHash(game.stopIndex)}`));'),
    ("teleported_cnot/teleported_cnot_main.js", "window.location.assign(", "globalThis.qollabNavigate("),
    ("steane_block/steane_block_main.js", "window.location.assign(", "globalThis.qollabNavigate("),
]

MAIN_JS = r"""// Qollab entry: runs the Python simulator in the browser and routes between the game's pages by location.hash.
import * as simulatorApi from 'quantum_bros.api';
import { PAGES } from './src/pages.js';

const qpuBackend = typeof backend !== 'undefined' ? backend : null;

globalThis.qollabSimulator = async (path, body) => {
    const text = await simulatorApi.handle.callPromising(qpuBackend, path, JSON.stringify(body));
    const result = JSON.parse(typeof text === 'string' ? text : text.toJs());
    if (result && result.error) {
        throw new Error(result.error);
    }
    return result;
};

const DEFAULT_PAGE = 'start';

// "level1.html" -> "#level1", "start.html#map-level1" -> "#start/map-level1". Anything else -> null.
function toHash(href) {
    const match = /^(?:\.\/)?([a-z0-9_]+)\.html(?:#(.*))?$/i.exec(href);
    if (!match || !PAGES[match[1]]) {
        return null;
    }
    return match[2] ? `#${match[1]}/${match[2]}` : `#${match[1]}`;
}

function navigate(href) {
    const hash = toHash(String(href)) ?? String(href);
    if (location.hash === hash) {
        location.reload();
        return;
    }
    location.hash = hash;
    // hashchange reloads the page, so each level module starts fresh.
}

globalThis.qollabToHash = (href) => toHash(href) ?? href;
globalThis.qollabNavigate = navigate;

window.addEventListener('hashchange', () => location.reload());

document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
    }
    const link = event.target.closest && event.target.closest('a[href]');
    if (!link) {
        return;
    }
    const href = link.getAttribute('href');
    if (/\.html(#|$)/.test(href) && toHash(href)) {
        event.preventDefault();
        navigate(href);
    }
}, true);

function readRoute() {
    const raw = location.hash.replace(/^#/, '');
    const slash = raw.indexOf('/');
    const name = slash === -1 ? raw : raw.slice(0, slash);
    const anchor = slash === -1 ? '' : `#${raw.slice(slash + 1)}`;
    return PAGES[name] ? { name, anchor } : { name: DEFAULT_PAGE, anchor: '' };
}

async function showPage() {
    const { name, anchor } = readRoute();
    const page = PAGES[name];
    globalThis.qollabAnchorHash = anchor;
    document.title = page.title;
    document.documentElement.lang = page.lang;
    document.body.className = page.bodyClass;
    document.getElementById('app').innerHTML = page.bodyHtml;
    for (const entry of page.entries) {
        await import(entry);
    }
}

showPage();
"""

INDEX_HTML = """<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Quantum Bros</title>{extra_head}
</head>
<body>
    <main id="app"></main>
</body>
</html>
"""

README_INTRO = """## Run on Qollab

This folder is the Qollab build of the game (made by `python3 tools/build_qollab.py`). Open the project on Qollab
and run it: `main.js` routes between the pages by the address hash (`#start`, `#level1`, `#start/map-level1`, ...),
`main.css` holds every stylesheet, and the simulator runs in the browser as the Python module `quantum_bros.api`
(called from JS with `.callPromising`), so no local server is needed. Stim, FastAPI and the HTTP server are left out.

"""


def fail(message: str) -> None:
    raise SystemExit(f"build_qollab: {message}")


def extract_page(page_name: str) -> dict:
    html = (GAME_DIR / f"{page_name}.html").read_text(encoding="utf-8")
    title_match = re.search(r"<title>(.*?)</title>", html, re.S)
    lang_match = re.search(r"<html[^>]*\blang=\"([^\"]*)\"", html)
    body_match = re.search(r"<body([^>]*)>(.*)</body>", html, re.S)
    if not (title_match and body_match):
        fail(f"{page_name}.html has no <title> or <body>")
    class_match = re.search(r"\bclass=\"([^\"]*)\"", body_match.group(1))
    head_and_body = html
    entries = re.findall(r"<script[^>]*type=\"module\"[^>]*src=\"([^\"]+)\"", head_and_body)
    if not entries:
        fail(f"{page_name}.html has no module script")
    body_html = body_match.group(2)
    body_html = re.sub(r"<script\b.*?</script>", "", body_html, flags=re.S)
    body_html = re.sub(r"<link\b[^>]*>", "", body_html)
    body_html = rewrite_page_links(body_html)
    return {
        "title": title_match.group(1).strip(),
        "lang": lang_match.group(1) if lang_match else "en",
        "bodyClass": f"{class_match.group(1) if class_match else ''} {page_class(page_name)}".strip(),
        "bodyHtml": body_html.strip(),
        "entries": [f"./{entry}" for entry in entries],
    }


def rewrite_page_links(body_html: str) -> str:
    def replace(match: re.Match) -> str:
        page, anchor = match.group(1), match.group(2)
        if page not in PAGE_NAMES:
            return match.group(0)
        return f'href="#{page}/{anchor}"' if anchor else f'href="#{page}"'

    return re.sub(r'href="([a-z0-9_]+)\.html(?:#([^"]*))?"', replace, body_html)


def find_page_stylesheets() -> dict[str, list[str]]:
    """Which pages load each stylesheet (from the <link> tags in game/*.html)."""
    loaded_by: dict[str, list[str]] = {}
    for page_name in PAGE_NAMES:
        html = (GAME_DIR / f"{page_name}.html").read_text(encoding="utf-8")
        for sheet in re.findall(r'<link[^>]*href="styles/([\w-]+)\.css"', html):
            loaded_by.setdefault(sheet, []).append(page_name)
    return loaded_by


def page_class(page_name: str) -> str:
    """The extra body class the router adds, so sheets can be scoped to the pages that used to load them."""
    return f"qollab-page-{page_name.replace('_', '-')}"


def split_top_level(text: str, separator: str) -> list[str]:
    parts, depth, start = [], 0, 0
    for index, char in enumerate(text):
        if char in "([":
            depth += 1
        elif char in ")]":
            depth -= 1
        elif char == separator and depth == 0:
            parts.append(text[start:index])
            start = index + 1
    parts.append(text[start:])
    return parts


def scope_selector(selector: str, scope: str) -> str:
    stripped = selector.strip()
    if not stripped or stripped.startswith((":root", "html")):
        return selector
    first_compound = re.split(r"[\s>+~]", stripped, maxsplit=1)[0]
    # Rules on the body itself (body, .start-page, ...) get the scope on that element; the rest below it.
    if first_compound.startswith("body") or re.search(r"\.[\w-]+-page(?![\w-])", first_compound):
        pseudo = re.search(r"::?[\w-]+(\(.*\))?$", first_compound)
        insert_at = len(first_compound) - (len(pseudo.group(0)) if pseudo else 0)
        return f"{stripped[:insert_at]}:where({scope}){stripped[insert_at:]}"
    return f":where({scope}) {stripped}"


def scope_css(css: str, scope: str) -> str:
    """Prefix every style rule's selectors with :where(scope) (no extra specificity). Recurses into @media and
    @supports; leaves @keyframes, @font-face and :root alone."""
    output, index = [], 0
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    while index < len(css):
        brace = css.find("{", index)
        if brace == -1:
            output.append(css[index:])
            break
        prelude = css[index:brace]
        depth, end = 1, brace + 1
        while depth:
            if css[end] == "{":
                depth += 1
            elif css[end] == "}":
                depth -= 1
            end += 1
        block = css[brace + 1:end - 1]
        head = prelude.strip()
        if head.startswith(("@media", "@supports", "@container", "@layer")):
            output.append(f"{prelude}{{{scope_css(block, scope)}}}")
        elif head.startswith("@"):
            output.append(f"{prelude}{{{block}}}")
        else:
            selectors = ", ".join(scope_selector(part, scope) for part in split_top_level(head, ","))
            output.append(f"\n{selectors} {{{block}}}")
        index = end
    return "".join(output)


def build_css() -> str:
    """All stylesheets in one. A sheet only some pages loaded is scoped to those pages, so sheets that never met
    before (e.g. start.css's .key-hint and world.css's) don't fight."""
    loaded_by = find_page_stylesheets()
    names = [path.stem for path in sorted((GAME_DIR / "styles").glob("*.css"))]
    ordered = [name for name in FIRST_STYLESHEETS if name in names]
    ordered += [name for name in names if name not in FIRST_STYLESHEETS]
    parts = [FONT_IMPORT, "", "/* Qollab: pages render inside <main id=\"app\">; let the body's layout see through it. */",
             "#app { display: contents; }", ""]
    for name in ordered:
        css = (GAME_DIR / "styles" / f"{name}.css").read_text(encoding="utf-8")
        if "@import" in css:
            fail(f"styles/{name}.css has an @import; main.css allows it only at the top")
        pages = loaded_by.get(name, [])
        if not pages:
            print(f"build_qollab: styles/{name}.css is not linked from any page; skipped")
            continue
        if set(pages) != set(PAGE_NAMES):
            css = scope_css(css, ", ".join(f".{page_class(page)}" for page in pages))
        parts.append(f"/* ===== styles/{name}.css ({', '.join(pages)}) ===== */")
        parts.append(css.strip())
        parts.append("")
    return "\n".join(parts) + "\n"


def copy_sources(output_dir: Path) -> None:
    source_dir = GAME_DIR / "src"
    for path in sorted(source_dir.rglob("*.js")):
        relative = path.relative_to(source_dir)
        if "tests" in relative.parts or path.name.endswith(".test.js"):
            continue
        target = output_dir / "src" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
    for relative, old, new in SOURCE_PATCHES:
        target = output_dir / "src" / relative
        text = target.read_text(encoding="utf-8")
        if old not in text:
            fail(f"patch for src/{relative} no longer matches: {old!r}")
        target.write_text(text.replace(old, new), encoding="utf-8")


def copy_python(output_dir: Path) -> None:
    if not (BACKEND_PACKAGE_DIR / "api.py").exists():
        print("build_qollab: WARNING backend/src/quantum_bros/api.py is missing; main.js imports quantum_bros.api")
    for path in sorted(BACKEND_PACKAGE_DIR.rglob("*.py")):
        relative = path.relative_to(BACKEND_PACKAGE_DIR)
        if relative.as_posix() in EXCLUDED_PYTHON_FILES or "__pycache__" in relative.parts:
            continue
        target = output_dir / "quantum_bros" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
    # The source package has no __init__.py files (namespace packages). Give every package folder an empty one, so
    # `import quantum_bros.api` resolves the same way in Qollab's Pyodide as in any regular Python.
    for package_dir in [output_dir / "quantum_bros", *sorted((output_dir / "quantum_bros").rglob("*"))]:
        if package_dir.is_dir() and not (package_dir / "__init__.py").exists():
            (package_dir / "__init__.py").write_text("")


def write_pages_module(output_dir: Path) -> None:
    pages = {name: extract_page(name) for name in PAGE_NAMES}
    module = ("// Generated by tools/build_qollab.py from game/*.html. Do not edit.\n"
              f"export const PAGES = {json.dumps(pages, indent=2, ensure_ascii=False)};\n")
    (output_dir / "src" / "pages.js").write_text(module, encoding="utf-8")


def check_limits(output_dir: Path) -> None:
    files = [path for path in output_dir.rglob("*") if path.is_file()]
    too_big = [path for path in files if path.stat().st_size > MAX_FILE_BYTES]
    total_bytes = sum(path.stat().st_size for path in files)
    print(f"build_qollab: {len(files)} files, {total_bytes} bytes total, largest "
          f"{max(path.stat().st_size for path in files)} bytes in {output_dir}")
    if len(files) > MAX_FILE_COUNT:
        fail(f"{len(files)} files; Qollab allows at most {MAX_FILE_COUNT}")
    if too_big:
        fail(f"files over 2 MB: {[str(path) for path in too_big]}")


def build(output_dir: Path = DEFAULT_OUTPUT_DIR, extra_head: str = "", extra_files: dict | None = None) -> Path:
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True)
    (output_dir / "index.html").write_text(INDEX_HTML.format(extra_head=extra_head), encoding="utf-8")
    (output_dir / "main.css").write_text(build_css(), encoding="utf-8")
    (output_dir / "main.js").write_text(MAIN_JS, encoding="utf-8")
    copy_sources(output_dir)
    write_pages_module(output_dir)
    copy_python(output_dir)
    (output_dir / "requirements.txt").write_text("", encoding="utf-8")
    readme = (PROJECT_DIR / "README.md").read_text(encoding="utf-8")
    title, _, rest = readme.partition("\n")
    (output_dir / "README.md").write_text(f"{title}\n\n{README_INTRO}{rest.lstrip()}", encoding="utf-8")
    for name, content in (extra_files or {}).items():
        (output_dir / name).write_text(content, encoding="utf-8")
    check_limits(output_dir)
    return output_dir


if __name__ == "__main__":
    build(Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OUTPUT_DIR)
