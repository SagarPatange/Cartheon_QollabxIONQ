#!/usr/bin/env node
/**
 * The local review inbox, from the terminal. Reads .review/reviews.jsonl (written by the dev server).
 *
 *   node tools/review/review.mjs watch [--all]   one line per NEW open review, polled every second
 *   node tools/review/review.mjs list            every open review, oldest first
 *   node tools/review/review.mjs done <id> [reply text]
 *
 * The watch lines are what Claude's monitor reads:
 *   REVIEW <id> [kind] <component> <src> :: <note>
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const INBOX = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.review', 'reviews.jsonl')

function load() {
  if (!existsSync(INBOX)) return []
  return readFileSync(INBOX, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .flatMap((l) => {
      try {
        return [JSON.parse(l)]
      } catch {
        return [] // the server is mid-append
      }
    })
}

const line = (r) =>
  `REVIEW ${r.id} [${r.kind}] ${r.components?.[0] ?? '?'} ${r.sources?.[0] ?? r.selector ?? ''} :: ${String(r.note ?? '').replace(/\s+/g, ' ').slice(0, 200)}`

const [cmd, ...args] = process.argv.slice(2)

if (cmd === 'watch') {
  const seen = new Set(args.includes('--all') ? [] : load().map((r) => r.id))
  const tick = () => {
    for (const r of load()) {
      if (!seen.has(r.id) && r.status === 'open') {
        seen.add(r.id)
        console.log(line(r))
      }
    }
  }
  console.log(`watching ${INBOX}`)
  setInterval(tick, 1000)
} else if (cmd === 'list') {
  const open = load().filter((r) => r.status === 'open')
  if (!open.length) console.log('no open reviews')
  for (const r of open) console.log(line(r))
} else if (cmd === 'done') {
  const [id, ...reply] = args
  if (!id) {
    console.error('usage: review.mjs done <id> [reply text]')
    process.exit(1)
  }
  const all = load()
  const hit = all.find((r) => r.id === id)
  if (!hit) {
    console.error(`no review ${id}`)
    process.exit(1)
  }
  hit.status = 'done'
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  hit.doneAt = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  if (reply.length) hit.reply = reply.join(' ')
  const tmp = INBOX + '.tmp'
  writeFileSync(tmp, all.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  renameSync(tmp, INBOX)
  console.log(`done ${id} · ${all.filter((r) => r.status === 'open').length} open`)
} else {
  console.error('usage: review.mjs watch [--all] | list | done <id> [reply text]')
  process.exit(1)
}
