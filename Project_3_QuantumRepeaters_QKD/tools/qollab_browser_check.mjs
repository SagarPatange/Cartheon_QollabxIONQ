// Drive headless Chrome over CDP: load each page of the Qollab test build by hash, collect console errors and
// exceptions, screenshot it, and walk map -> level1 -> map. Usage: node qollab_browser_check.mjs <url> <shotDir> <pages>
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

const [baseUrl, shotDir, pageList] = process.argv.slice(2);
const pages = pageList.split(",");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
    return new Promise((resolve) => {
        const server = createServer();
        server.listen(0, () => { const { port } = server.address(); server.close(() => resolve(port)); });
    });
}

const port = await freePort();
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "qollab-chrome-"))}`, "--no-first-run", "--window-size=1280,800",
    "about:blank"], { stdio: "ignore" });
let target;
for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = list.find((t) => t.type === "page");
    } catch { /* not up yet */ }
}
if (!target) { console.error("chrome did not start"); chrome.kill(); process.exit(2); }

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
let nextId = 1;
const pending = new Map();
let problems = [];
socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
        return;
    }
    if (message.method === "Runtime.exceptionThrown") {
        const d = message.params.exceptionDetails;
        problems.push(`exception: ${d.exception?.description ?? d.text}`);
    } else if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
        problems.push(`console.${message.params.type}: ${message.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error" && !String(message.params.entry.url).endsWith("/favicon.ico")) {
        problems.push(`log: ${message.params.entry.text} ${message.params.entry.url ?? ""}`);
    }
});
const send = (method, params = {}) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) =>
    (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
mkdirSync(shotDir, { recursive: true });

async function load(hash) {
    await send("Page.navigate", { url: "about:blank" });
    await sleep(200);
    problems = [];
    // A base ending in "/" means the original multi-page game (for comparing screenshots).
    const url = baseUrl.endsWith("/") ? `${baseUrl}${hash.replace(/\/(.*)$/, ".html#$1").replace(/^([a-z0-9_]+)$/, "$1.html")}` : `${baseUrl}#${hash}`;
    await send("Page.navigate", { url });
    await sleep(3500);
}

async function shoot(name) {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(shotDir, `${name}.png`), Buffer.from(shot.result.data, "base64"));
}

const report = {};
for (const page of pages) {
    await load(page);
    const state = await evaluate(`({hash: location.hash, bodyClass: document.body.className, title: document.title,
        appChildren: document.getElementById('app').children.length})`);
    report[page] = { ...state, problems: [...problems] };
    await shoot(page);
}

// Navigation: the map at level 1's stop, Enter walks into level1; level1's "◀ Map" link goes back.
await load("start/map-level1");
await shoot("start_map_level1");
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
await sleep(3500);
const afterEnter = await evaluate("({hash: location.hash, bodyClass: document.body.className})");
await evaluate(`document.querySelector('a.hud-link')?.click()`);
await sleep(3500);
const afterMapLink = await evaluate("({hash: location.hash, bodyClass: document.body.className})");
report.navigation = { afterEnter, afterMapLink, problems: [...problems] };

console.log(JSON.stringify(report, null, 2));
socket.close();
chrome.kill();
const failed = pages.filter((p) => report[p].problems.length > 0 || report[p].appChildren === 0);
const navOk = afterEnter.hash === "#level1" && afterMapLink.hash === "#start/map-level1";
console.log(failed.length ? `PAGES WITH PROBLEMS: ${failed.join(", ")}` : "all pages loaded without errors");
console.log(navOk ? "navigation map -> level1 -> map OK" : "NAVIGATION FAILED");
process.exit(failed.length || !navOk ? 1 : 0);
