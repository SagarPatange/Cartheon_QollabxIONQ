/**
 * Local review loop, dev server only. Never part of a production build.
 *
 * 1. Tags every lowercase JSX element in src/**.tsx with data-src="src/file.tsx:line", so a click maps to source.
 * 2. Injects tools/review/client.ts, the Alt+right-click popover.
 * 3. Serves /__review: POST appends one note to .review/reviews.jsonl (screenshot to .review/shots/<id>.png),
 *    GET returns every note. `npm run review:watch` prints new notes for Claude to act on.
 */
import fs from 'node:fs'
import path from 'node:path'
import MagicString from 'magic-string'
import ts from 'typescript'
import type { Plugin } from 'vite'

export interface Review {
  id: string
  status: 'open' | 'done'
  at: string
  [key: string]: unknown
}

export function readReviews(file: string): Review[] {
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Review]
      } catch {
        return [] // a line mid-append
      }
    })
}

/** Insert data-src="rel:line" after the tag name of every intrinsic JSX element. */
export function tagSources(code: string, file: string, rel: string) {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out = new MagicString(code)
  let touched = false
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName
      const tagged = node.attributes.properties.some((p) => ts.isJsxAttribute(p) && p.name.getText(sf) === 'data-src')
      if (ts.isIdentifier(tag) && /^[a-z]/.test(tag.text) && !tagged) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
        out.appendLeft(tag.getEnd(), ` data-src="${rel}:${line}"`)
        touched = true
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  if (!touched) return null
  return { code: out.toString(), map: out.generateMap({ hires: true, source: file, includeContent: true }) }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Local time, e.g. 2026-10-11T16:16:50, matching the id. */
const localIso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

function stamp(dir: string, inbox: string, d: Date): string {
  const base = `r${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  const taken = new Set(readReviews(inbox).map((r) => r.id))
  let id = base
  for (let i = 2; taken.has(id) || fs.existsSync(path.join(dir, 'shots', `${id}.png`)); i++) id = `${base}-${i}`
  return id
}

export function review(): Plugin {
  let root = process.cwd()
  return {
    name: 'qday-review',
    apply: 'serve',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
    },
    transform(code, id) {
      const file = id.split('?')[0]
      if (!file.endsWith('.tsx') || file.includes('node_modules')) return null
      const rel = path.relative(root, file).split(path.sep).join('/')
      if (!rel.startsWith('src/')) return null
      return tagSources(code, file, rel)
    },
    transformIndexHtml() {
      return [{ tag: 'script', attrs: { type: 'module', src: '/tools/review/client.ts' }, injectTo: 'body' }]
    },
    configureServer(server) {
      const dir = path.join(root, '.review')
      const inbox = path.join(dir, 'reviews.jsonl')
      server.middlewares.use('/__review', (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method === 'GET') return send(200, readReviews(inbox))
        if (req.method !== 'POST') return send(405, { error: 'use GET or POST' })
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
            fs.mkdirSync(path.join(dir, 'shots'), { recursive: true })
            const now = new Date()
            const id = stamp(dir, inbox, now)
            const { screenshot, ...rest } = body
            const entry: Review = { id, status: 'open', at: localIso(now), ...rest }
            if (typeof screenshot === 'string' && screenshot.startsWith('data:image/png;base64,')) {
              const shot = path.join(dir, 'shots', `${id}.png`)
              fs.writeFileSync(shot, Buffer.from(screenshot.split(',', 2)[1], 'base64'))
              entry.shot = shot
            }
            fs.appendFileSync(inbox, JSON.stringify(entry) + '\n', 'utf8')
            const open = readReviews(inbox).filter((r) => r.status === 'open').length
            server.config.logger.info(`review ${id} [${String(entry.kind)}] ${String(entry.note ?? '').slice(0, 80)}`, { timestamp: true })
            send(200, { id, open })
          } catch (err) {
            send(400, { error: String(err) })
          }
        })
      })
    },
  }
}
