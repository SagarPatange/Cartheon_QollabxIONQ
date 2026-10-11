import type { ReactNode } from 'react'
import { gcd } from '../shor/math'
import { type Derived, type LevelId, type Run } from '../shor/model'

interface Props {
  level: LevelId
  run: Run
  d: Derived
  onPickKey: (a: number) => void
}

const MAX_BINS = 512
/** Long lists (a cycle of 198 replies, hundreds of peaks) show their start and an ellipsis. */
const head = <T,>(xs: T[], n = 8) => xs.slice(0, n)

interface BarLabel {
  k: number
  text: string
  strong?: boolean
}

/**
 * One thin bar per counting-register value. `at(k)` gives height 0..1 and a colour.
 * Bars stretch to any width; labels are HTML so they stay readable.
 */
function Bars({ Q, at, labels = [], label }: { Q: number; at: (k: number) => { h: number; c: string }; labels?: BarLabel[]; label: string }) {
  // a large Q has a million codes; draw at most MAX_BINS bars, each the tallest code in its slice
  const bins = Math.min(Q, MAX_BINS)
  const binAt = (b: number) => {
    const from = Math.floor((b * Q) / bins)
    const to = Math.max(from + 1, Math.floor(((b + 1) * Q) / bins))
    let best = at(from)
    for (let k = from + 1; k < to; k++) {
      const v = at(k)
      if (v.h > best.h) best = v
    }
    return best
  }
  return (
    <div className="bars">
      <svg viewBox={`0 0 ${bins} 100`} preserveAspectRatio="none" role="img" aria-label={label}>
        <line x1="0" y1="99.5" x2={bins} y2="99.5" stroke="var(--border)" vectorEffect="non-scaling-stroke" />
        {Array.from({ length: bins }, (_, b) => {
          const { h, c } = binAt(b)
          const w = h > 0.9 ? 2.4 : 0.85
          return <rect key={b} x={b + 0.5 - w / 2} y={100 - h * 98} width={w} height={h * 98} fill={c} />
        })}
      </svg>
      <div className="bar-labels">
        {labels.map((l) => {
          const pct = ((l.k + 0.5) / Q) * 100
          const shift = pct < 6 ? '0' : pct > 94 ? '-100%' : '-50%'
          return (
            <span key={l.k} className={l.strong ? 'strong' : ''} style={{ left: `${pct}%`, transform: `translateX(${shift})` }}>
              {l.text}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Label/value pairs beside the main readout. */
function Side({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="ro-side">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A stepper for the key a: big number, previous and next, and a random pick. No hint at which keys fit. */
function KeyPicker({ run, onPickKey }: { run: Run; onPickKey: (a: number) => void }) {
  const lo = 2
  const hi = run.N - 2
  const set = (a: number) => onPickKey(Math.min(hi, Math.max(lo, a)))
  return (
    <div className="keys" role="group" aria-label="Pick a key">
      <button type="button" className="bar-btn" onClick={() => set(run.a - 1)} disabled={run.a <= lo} aria-label="Previous key">
        ◀
      </button>
      <output className="key-a" aria-live="polite">
        a = {run.a}
      </output>
      <button type="button" className="bar-btn" onClick={() => set(run.a + 1)} disabled={run.a >= hi} aria-label="Next key">
        ▶
      </button>
      <button type="button" className="bar-btn" onClick={() => set(lo + Math.floor(Math.random() * (hi - lo + 1)))}>
        Random
      </button>
    </div>
  )
}

/** What the level shows in the status bar: the register, the data, or the key picker. */
export function Readout({ level, run, d, onPickKey }: Props) {
  const width = 2 * d.n
  const max = d.dist.reduce((m, v) => Math.max(m, v), 0)

  switch (level) {
    case 0:
      return (
        <div className="ro" key={level}>
          <KeyPicker run={run} onPickKey={onPickKey} />
        </div>
      )

    case 1:
      return (
        <div className="ro" key={level}>
          <div className="regs">
            <div className="reg">
              <div className="chips">
                {Array.from({ length: width }, (_, i) => (
                  <span key={i} className="chip-q blade">
                    0
                  </span>
                ))}
              </div>
              <small>key · 2n = {width}</small>
            </div>
            <div className="reg">
              <div className="chips">
                {Array.from({ length: d.n }, (_, i) => (
                  <span key={i} className="chip-q pin">
                    {i === d.n - 1 ? 1 : 0}
                  </span>
                ))}
              </div>
              <small>pins · n = {d.n}</small>
            </div>
          </div>
          <Side rows={[['qubits', `3n = ${3 * d.n}`]]} />
        </div>
      )

    case 2:
      return (
        <div className="ro" key={level}>
          <Bars
            Q={d.Q}
            label="Every code with the same amplitude"
            at={() => ({ h: 0.55, c: 'var(--quantum)' })}
            labels={[
              { k: 0, text: '0' },
              { k: d.Q - 1, text: String(d.Q - 1) },
            ]}
          />
          <Side
            rows={[
              ['codes', d.Q],
              ['each', `1/${Math.sqrt(d.Q)}`],
            ]}
          />
        </div>
      )

    case 3:
      return (
        <div className="ro" key={level}>
          <Bars Q={d.Q} label="Codes coloured by their reply" at={(k) => ({ h: 0.55, c: `var(--r${(k % d.R) % 6})` })} />
          <Side
            rows={[
              [
                'replies',
                <span className="cycle" key="c">
                  {head(d.rem).map((v, j) => (
                    <span key={j} style={{ color: `var(--r${j % 6})` }}>
                      {v}
                    </span>
                  ))}
                  <span className="muted">…</span>
                </span>,
              ],
              ['period', `R = ${d.R}`],
            ]}
          />
        </div>
      )

    case 4:
      return (
        <div className="ro" key={level}>
          <Bars
            Q={d.Q}
            label="Probability of each code after the inverse QFT"
            at={(k) => {
              const h = d.dist[k] / max
              return { h, c: h > 0.01 ? 'var(--quantum)' : 'transparent' }
            }}
            labels={head(d.peakKs, 3).map((k) => ({ k, text: String(k), strong: true }))}
          />
          <Side
            rows={[
              ['clicks', d.R],
              ['spacing', `${d.Q}/R ≈ ${+(d.Q / d.R).toFixed(1)}`],
            ]}
          />
        </div>
      )

    case 5: {
      const k = run.k ?? 0
      const reply = run.dIndex === null ? d.rem[0] : d.rem[run.dIndex]
      return (
        <div className="ro" key={`${level}-${k}`}>
          <Bars
            Q={d.Q}
            label="The measured code among the peaks"
            at={(kk) => {
              const h = d.dist[kk] / max
              return { h, c: kk === k ? 'var(--moving)' : h > 0.01 ? 'var(--rail)' : 'transparent' }
            }}
            labels={[{ k, text: `k = ${k}`, strong: true }]}
          />
          <Side
            rows={[
              ['key', k.toString(2).padStart(width, '0')],
              ['pins', `${reply.toString(2).padStart(d.n, '0')} = ${reply}`],
            ]}
          />
        </div>
      )
    }

    case 6: {
      const o = d.outcome
      const k = run.k ?? 0
      const gk = gcd(k, d.Q) || 1
      if (o?.kind === 'factored')
        return (
          <div className="ro" key={`${level}-${k}`}>
            <Side
              rows={[
                ['fraction', `${k}/${d.Q} = ${k / gk}/${d.Q / gk}`],
                ['period', `R = ${o.R}`],
                ['root', `${run.a}^${o.R / 2} ≡ ${o.root}`],
              ]}
            />
            <div className="ro-result ok">
              {run.N} = {o.p} × {o.q}
            </div>
          </div>
        )
      return (
        <div className="ro" key={`${level}-${k}`}>
          <div className="ro-result bad">{o?.kind === 'wrong-period' ? 'False set' : o?.kind === 'no-info' ? 'No information' : 'Bad key'}</div>
          {o?.kind === 'wrong-period' && <Side rows={[['check', `${run.a}^${o.guess} mod ${run.N} = ${o.check} ≠ 1`]]} />}
          {o?.kind === 'no-info' && <Side rows={[['k', '0 has no period to read']]} />}
          {(o?.kind === 'odd-period' || o?.kind === 'trivial-root') && <Side rows={[['why', 'this key can never split N']]} />}
        </div>
      )
    }
  }
}
