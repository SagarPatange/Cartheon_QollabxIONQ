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
// Every page's code, imported statically: Qollab resolves import statements it can see, but not an import() whose
// path is only known at run time. Only the current page's start functions run (see showPage).
import { PAGE_STARTERS } from './src/page_starters.js';

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

// Pages change without a reload: on Qollab a reload restarts the whole project (Python and Qiskit included), which
// leaves the player on Qollab's loading screen. So what a page leaves running is recorded while it runs and stopped
// before the next page starts: its keyboard and resize listeners on window and document, its intervals, its resize
// observers and the QPU panel. Only those: other listeners (e.g. "message") and one-shot timeouts may belong to
// Pyodide or Qollab, and a page's leftover timeouts only touch its own, already detached, elements.
const PAGE_EVENT_TYPES = new Set(['keydown', 'keyup', 'resize']);
const pageCleanups = [];
let isPageRunning = false;

function addPageCleanup(cleanup) {
    if (isPageRunning) {
        pageCleanups.push(cleanup);
    }
}

function stopCurrentPage() {
    isPageRunning = false;
    for (const cleanup of pageCleanups.splice(0)) {
        cleanup();
    }
}

for (const target of [window, document]) {
    const addListener = target.addEventListener.bind(target);
    target.addEventListener = (type, listener, options) => {
        addListener(type, listener, options);
        if (PAGE_EVENT_TYPES.has(type)) {
            addPageCleanup(() => target.removeEventListener(type, listener, options));
        }
    };
}
const nativeSetInterval = window.setInterval.bind(window);
window.setInterval = (callback, delay, ...args) => {
    const id = nativeSetInterval(callback, delay, ...args);
    addPageCleanup(() => clearInterval(id));
    return id;
};
const NativeResizeObserver = window.ResizeObserver;
window.ResizeObserver = class extends NativeResizeObserver {
    constructor(callback) {
        super(callback);
        addPageCleanup(() => this.disconnect());
    }
};

function navigate(href) {
    const hash = toHash(String(href)) ?? String(href);
    if (location.hash === hash) {
        showPage();
        return;
    }
    location.hash = hash;
    // hashchange shows the new page.
}

globalThis.qollabToHash = (href) => toHash(href) ?? href;
globalThis.qollabNavigate = navigate;

window.addEventListener('hashchange', () => showPage());

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

function showPage() {
    stopCurrentPage();
    const { name, anchor } = readRoute();
    const page = PAGES[name];
    globalThis.qollabAnchorHash = anchor;
    document.title = page.title;
    document.documentElement.lang = page.lang;
    document.body.className = page.bodyClass;
    document.getElementById('app').innerHTML = page.bodyHtml;
    window.scrollTo(0, 0);
    isPageRunning = true;
    for (const startPage of PAGE_STARTERS[name]) {
        startPage();
    }
    if (name === DEFAULT_PAGE) {
        mountQpuPanel();
    }
}

// The one experiment that runs on the backend picked in Select QPU: the 13-qubit repetition-code repeater, one job.
function mountQpuPanel() {
    const panel = document.createElement('aside');
    panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:50;max-width:340px;padding:12px 14px;'
        + 'background:#1d1d2b;color:#f4f4f4;border:3px solid #000;box-shadow:4px 4px 0 #000;'
        + 'font:10px/1.7 "Press Start 2P",monospace;';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Run repeater on QPU';
    button.style.cssText = 'font:inherit;padding:8px 10px;background:#7b4dff;color:#fff;border:2px solid #000;'
        + 'cursor:pointer;';
    const output = document.createElement('div');
    output.style.marginTop = '8px';
    output.textContent = '13 qubits, one job on your Select QPU backend.';
    button.addEventListener('click', async () => {
        button.disabled = true;
        output.textContent = 'Running 1000 shots...';
        try {
            const result = await globalThis.qollabSimulator('/api/qpu-repeater', { shots: 1000 });
            output.innerHTML = `Backend: ${result.backend_name}<br>`
                + `ZZ = ${result.zz_correlation.toFixed(3)}, XX = ${result.xx_correlation.toFixed(3)}<br>`
                + `Fidelity &ge; ${result.fidelity_lower_bound.toFixed(3)}`;
        } catch (error) {
            output.textContent = `Could not run: ${error.message}`;
        }
        button.disabled = false;
        button.blur();
    });
    panel.append(button, output);
    document.body.append(panel);
    addPageCleanup(() => panel.remove());
}

// On Qollab the game runs in a frame, and after Run the keyboard focus can stay on Qollab's own page, so key presses
// never reach the game and Enter seems to do nothing. While the frame has no focus, a full-window prompt asks for one
// click, which gives it focus; it comes back if focus leaves, so the keys never stop working silently.
function mountFocusPrompt() {
    const prompt = document.createElement('button');
    prompt.type = 'button';
    prompt.style.cssText = 'position:fixed;inset:0;z-index:100;display:none;place-items:center;width:100%;'
        + 'height:100%;padding:0;border:0;background:rgba(0,0,0,0.6);cursor:pointer;';
    // A solid box, so the prompt never sits on top of the page's own text.
    const label = document.createElement('span');
    label.textContent = '▶ Click to play, then use the keyboard';
    label.style.cssText = 'padding:18px 26px;color:#000;background:#f8b800;border:4px solid #000;'
        + 'box-shadow:6px 6px 0 #000;font:16px/1.6 "Press Start 2P",monospace;';
    prompt.append(label);
    const showIfUnfocused = () => {
        prompt.style.display = document.hasFocus() ? 'none' : 'grid';
    };
    prompt.addEventListener('click', () => {
        window.focus();
        prompt.style.display = 'none';
    });
    window.addEventListener('focus', showIfUnfocused);
    window.addEventListener('blur', showIfUnfocused);
    document.body.append(prompt);
    // A page may take focus itself while it loads (the title screen focuses Continue); check once it has had the chance.
    setTimeout(showIfUnfocused, 300);
}

// The focus prompt stays across pages, so it is mounted before any page runs (and records nothing to stop).
mountFocusPrompt();
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


def write_page_starters(output_dir: Path) -> None:
    """Turn each page's entry module into one that exports its start function instead of calling it, and write
    src/page_starters.js, which imports them all statically and lists each page's start functions in order.

    Every entry module ends with one call, e.g. `startStartPage();`, and touches no DOM before it, so importing all of
    them on every page is safe. main.js then calls only the current page's.
    """
    import_lines = []
    starters_by_page = {}
    for page_name in PAGE_NAMES:
        starters_by_page[page_name] = []
        for entry in extract_page(page_name)["entries"]:
            module_path = output_dir / entry.removeprefix("./")
            text = module_path.read_text(encoding="utf-8")
            match = re.search(r"^(\w+)\(\);\s*\Z", text, re.M)
            if match is None:
                fail(f"{entry} must end with one start call, e.g. startPage();")
            module_path.write_text(f"{text[:match.start()]}export {{ {match.group(1)} as startPage }};\n",
                                   encoding="utf-8")
            starter_name = f"start{len(import_lines)}"
            relative = entry.removeprefix("./src/")
            import_lines.append(f"import {{ startPage as {starter_name} }} from './{relative}';")
            starters_by_page[page_name].append(starter_name)
    entries = [f"    {name}: [{', '.join(starters)}]," for name, starters in starters_by_page.items()]
    module = ("// Generated by tools/build_qollab.py. Do not edit.\n" + "\n".join(import_lines)
              + "\n\nexport const PAGE_STARTERS = {\n" + "\n".join(entries) + "\n};\n")
    (output_dir / "src" / "page_starters.js").write_text(module, encoding="utf-8")


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
    write_page_starters(output_dir)
    write_pages_module(output_dir)
    copy_python(output_dir)
    (output_dir / "requirements.txt").write_text("", encoding="utf-8")
    # The project card: QOLLAB_README.md. The full tutorial goes along as GUIDE.md, without its images (not shipped).
    card = (PROJECT_DIR / "QOLLAB_README.md").read_text(encoding="utf-8")
    (output_dir / "README.md").write_text(card, encoding="utf-8")
    readme = (PROJECT_DIR / "README.md").read_text(encoding="utf-8")
    title, _, rest = readme.partition("\n")
    guide = f"{title}\n\n{README_INTRO}{rest.lstrip()}"
    guide = re.sub(r"^!\[.*\]\([^)]*\)\n\n?", "", guide, flags=re.MULTILINE)
    (output_dir / "GUIDE.md").write_text(guide, encoding="utf-8")
    for name, content in (extra_files or {}).items():
        (output_dir / name).write_text(content, encoding="utf-8")
    check_limits(output_dir)
    return output_dir


if __name__ == "__main__":
    build(Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OUTPUT_DIR)
