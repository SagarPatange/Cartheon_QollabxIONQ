/**
 * Dev-only review popover, injected by tools/review/vite-plugin.ts.
 * Alt+right-click any element: it is outlined, you write a note, and the note is saved with where it is
 * (source file and line, React components, selector, the app's level and key) plus a screenshot.
 */
import { toCanvas } from 'html-to-image'

type Kind = 'change' | 'bug' | 'design'

interface AppState {
  level: number
  run: { N: number; a: number; k: number | null; dIndex: number | null }
}

interface Picked {
  url: string
  title: string
  selector: string
  text: string
  html: string
  sources: string[]
  components: string[]
  rect: { x: number; y: number; w: number; h: number }
  click: { x: number; y: number }
  viewport: { w: number; h: number; dpr: number }
  state: AppState | null
  repro: string | null
}

const flagged = window as unknown as { __qdayReview?: boolean; __qdayState?: AppState }

const KINDS: { id: Kind; label: string }[] = [
  { id: 'change', label: 'Change' },
  { id: 'bug', label: 'Bug' },
  { id: 'design', label: 'Design' },
]

const LEVEL_NAMES = ['Pick a Key', 'Blank Slate', 'All at Once', 'The Lock Answers', 'Turn the Key', 'Pins Drop', 'Crack the Lock']

const SKIP = /^(StrictMode|Fragment|Suspense|Provider|Consumer|Context)$/

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.hl {
  position: fixed; border: 2px solid var(--accent); border-radius: 6px; pointer-events: none;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 16%, transparent);
  transition: left .12s ease-out, top .12s ease-out, width .12s ease-out, height .12s ease-out;
}
.pop {
  position: fixed; width: 360px; max-width: calc(100vw - 16px); pointer-events: auto;
  display: grid; gap: 10px; padding: 14px 16px 16px;
  background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 12px;
  box-shadow: 0 22px 60px rgba(0, 0, 0, .45), 0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent);
  font: 14px/1.45 var(--font);
  animation: rise .16s ease-out;
}
@keyframes rise { from { opacity: 0; transform: translateY(4px); } }
.eyebrow {
  display: flex; justify-content: space-between; gap: 8px;
  font: 500 11px/1 var(--font); letter-spacing: .12em; text-transform: uppercase; color: var(--muted);
}
.eyebrow b { color: var(--accent); font-weight: 500; }
.where { display: grid; gap: 2px; min-width: 0; }
.where .comp { font: 700 17px/1.2 var(--font); letter-spacing: -.01em; }
.where .src { font: 500 12px/1.3 var(--font); color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kinds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 3px; border-radius: 8px; background: var(--chip-bg); }
.kinds button {
  all: unset; cursor: pointer; text-align: center; padding: 6px 0; border-radius: 6px;
  font: 500 13px/1 var(--font); color: var(--muted); transition: background .15s, color .15s;
}
.kinds button:hover { color: var(--text); }
.kinds button[aria-checked="true"] { background: var(--accent); color: var(--on-fill); }
.kinds button:focus-visible, .save:focus-visible { outline: 2px solid var(--quantum); outline-offset: 2px; }
textarea {
  width: 100%; min-height: 92px; resize: vertical; padding: 10px 12px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--bg); color: var(--text);
  font: 14px/1.45 var(--font); outline: none; transition: border-color .15s;
}
textarea::placeholder { color: var(--muted); }
textarea:focus { border-color: var(--accent); }
.row { display: flex; align-items: center; gap: 10px; }
.hint { flex: 1; font: 500 11px/1.3 var(--font); color: var(--muted); }
.save {
  all: unset; cursor: pointer; padding: 8px 16px; border-radius: 8px;
  background: var(--accent); color: var(--on-fill); font: 500 14px/1 var(--font);
}
.save[disabled] { opacity: .5; cursor: default; }
.toast {
  position: fixed; right: 16px; bottom: 16px; pointer-events: none; padding: 10px 14px; border-radius: 8px;
  background: var(--panel); color: var(--text); border: 1px solid var(--border); border-left: 3px solid var(--accent);
  box-shadow: 0 14px 40px rgba(0, 0, 0, .35); font: 500 13px/1.3 var(--font);
}
.toast.err { border-left-color: var(--error); }
@media (prefers-reduced-motion: reduce) { .pop { animation: none; } .hl { transition: none; } }
`

const HTML = `
<div class="hl" hidden></div>
<form class="pop" hidden aria-label="Leave a review note">
  <div class="eyebrow"><span>Review note</span><b class="lvl"></b></div>
  <div class="where"><span class="comp"></span><span class="src"></span></div>
  <div class="kinds" role="radiogroup" aria-label="Kind">
    ${KINDS.map((k, i) => `<button type="button" role="radio" data-k="${k.id}" aria-checked="${i === 0}">${k.label}</button>`).join('')}
  </div>
  <textarea id="qday-review-note" name="note" placeholder="What should change here?"></textarea>
  <div class="row"><span class="hint">Ctrl+Enter save · Esc cancel</span><button type="submit" class="save">Save note</button></div>
</form>
<div class="toast" role="status" hidden></div>
`

function selectorOf(el: Element): string {
  const parts: string[] = []
  for (let node: Element | null = el; node && node !== document.body && parts.length < 7; node = node.parentElement) {
    const tag = node.tagName.toLowerCase()
    if (node.id) {
      parts.unshift(`${tag}#${node.id}`)
      break
    }
    let part = tag
    const classes = [...node.classList].slice(0, 3)
    if (classes.length) part += '.' + classes.join('.')
    const parent = node.parentElement
    const same = parent ? [...parent.children].filter((c) => c.tagName === node!.tagName) : []
    if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`
    parts.unshift(part)
  }
  return parts.join(' > ')
}

/** data-src values from the element up, nearest first, without repeats. */
function sourcesOf(el: Element): string[] {
  const out: string[] = []
  for (let node: Element | null = el; node && out.length < 5; node = node.parentElement) {
    const src = node.getAttribute('data-src')
    if (src && !out.includes(src)) out.push(src)
  }
  return out
}

/** React component names from the element's fiber up to the root, nearest first. */
interface Fiber {
  type?: unknown
  return?: Fiber | null
}

function fiberOf(el: Element): Fiber | null {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const key = Object.keys(node).find((k) => k.startsWith('__reactFiber$'))
    if (key) return (node as unknown as Record<string, Fiber>)[key]
  }
  return null
}

function componentsOf(el: Element): string[] {
  const names: string[] = []
  for (let f = fiberOf(el); f && names.length < 8; f = f.return ?? null) {
    const t = f.type as { displayName?: string; name?: string } | string | undefined
    const name = t && typeof t !== 'string' ? t.displayName || t.name : null
    if (name && /^[A-Z]/.test(name) && !SKIP.test(name) && names[names.length - 1] !== name) names.push(name)
  }
  return names
}

function reproOf(state: AppState | null): string | null {
  if (!state) return null
  const q = new URLSearchParams({ level: String(state.level), a: String(state.run.a) })
  if (state.level >= 5 && state.run.k !== null) {
    q.set('k', String(state.run.k))
    q.set('d', String(state.run.dIndex ?? 0))
  }
  return `${location.origin}${location.pathname}?${q}`
}

function mount(): void {
  const host = document.createElement('div')
  host.id = 'qday-review'
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>${CSS}</style>${HTML}`
  document.body.appendChild(host)

  const $ = <T extends Element>(s: string) => root.querySelector(s) as T
  const hl = $<HTMLDivElement>('.hl')
  const pop = $<HTMLFormElement>('.pop')
  const comp = $<HTMLSpanElement>('.comp')
  const src = $<HTMLSpanElement>('.src')
  const lvl = $<HTMLElement>('.lvl')
  const note = $<HTMLTextAreaElement>('textarea')
  const saveBtn = $<HTMLButtonElement>('.save')
  const toast = $<HTMLDivElement>('.toast')
  const kindBtns = [...root.querySelectorAll<HTMLButtonElement>('.kinds button')]

  let kind: Kind = 'change'
  let picked: Picked | null = null
  let toastTimer = 0

  const setKind = (k: Kind) => {
    kind = k
    kindBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.k === k)))
  }
  kindBtns.forEach((b) => b.addEventListener('click', () => setKind(b.dataset.k as Kind)))

  const say = (msg: string, err = false, ms = 2600) => {
    clearTimeout(toastTimer)
    toast.textContent = msg
    toast.className = 'toast' + (err ? ' err' : '')
    toast.hidden = false
    if (ms > 0) toastTimer = window.setTimeout(() => (toast.hidden = true), ms)
  }

  const close = () => {
    pop.hidden = true
    hl.hidden = true
    picked = null
  }

  window.addEventListener(
    'contextmenu',
    (event) => {
      if (!event.altKey) return
      const el = event.target
      if (!(el instanceof Element) || host.contains(el)) return
      // window capture runs before anything on document, including the Cartheon review extension
      event.preventDefault()
      event.stopImmediatePropagation()

      const r = el.getBoundingClientRect()
      Object.assign(hl.style, { left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` })
      hl.hidden = false

      const state = flagged.__qdayState ?? null
      const sources = sourcesOf(el)
      const components = componentsOf(el)
      picked = {
        url: location.href,
        title: document.title,
        selector: selectorOf(el),
        text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 300),
        html: el.outerHTML.slice(0, 600),
        sources,
        components,
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        click: { x: event.clientX, y: event.clientY },
        viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
        state,
        repro: reproOf(state),
      }

      comp.textContent = components[0] ?? el.tagName.toLowerCase()
      src.textContent = sources[0] ?? picked.selector
      src.title = sources.join('\n')
      lvl.textContent = state ? `level ${state.level} · ${LEVEL_NAMES[state.level] ?? ''}` : ''

      pop.hidden = false
      const w = pop.offsetWidth
      const h = pop.offsetHeight
      const left = Math.min(event.clientX + 14, innerWidth - w - 8)
      const top = Math.min(event.clientY + 14, innerHeight - h - 8)
      Object.assign(pop.style, { left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` })
      note.value = ''
      setKind('change')
      saveBtn.disabled = false
      note.focus()
    },
    true,
  )

  async function screenshot(rect: Picked['rect']): Promise<string | null> {
    const brass = getComputedStyle(document.documentElement).getPropertyValue('--brass').trim() || '#d9a441'
    const base = {
      pixelRatio: 1,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      filter: (n: Node) => n !== host,
    }
    let page: HTMLCanvasElement
    try {
      page = await toCanvas(document.body, base)
    } catch {
      try {
        page = await toCanvas(document.body, { ...base, skipFonts: true })
      } catch {
        return null
      }
    }
    const out = document.createElement('canvas')
    out.width = innerWidth
    out.height = innerHeight
    const ctx = out.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(page, scrollX, scrollY, innerWidth, innerHeight, 0, 0, innerWidth, innerHeight)
    ctx.strokeStyle = brass
    ctx.lineWidth = 3
    ctx.strokeRect(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6)
    return out.toDataURL('image/png')
  }

  async function save(): Promise<void> {
    if (!picked) return
    const text = note.value.trim()
    if (!text) {
      note.focus()
      return
    }
    const review: Record<string, unknown> = { ...picked, kind, note: text }
    saveBtn.disabled = true
    pop.hidden = true
    say('Saving…', false, 0)
    const shot = await screenshot(picked.rect).catch(() => null)
    if (shot) review.screenshot = shot
    close()
    try {
      const res = await fetch('/__review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(review),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { id: string; open: number }
      say(`Saved ${body.id} · ${body.open} open${shot ? '' : ' · no screenshot'}`)
    } catch (err) {
      say(`Not saved: ${String(err)}. Is npm run dev running?`, true, 6000)
    }
  }

  pop.addEventListener('submit', (e) => {
    e.preventDefault()
    void save()
  })
  note.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void save()
    }
    if (e.key === 'Escape') close()
    e.stopPropagation() // the app's arrow-key level navigation must not see typing in the note
  })
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && picked) close()
    },
    true,
  )
}

if (!flagged.__qdayReview) {
  flagged.__qdayReview = true
  mount()
}
