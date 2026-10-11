import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import gsap from 'gsap'
import { LEVELS, courseOf } from '../shor/levels'
import type { LevelId } from '../shor/model'
import { KeyShape } from './Key'
import { qubitsFor } from '../shor/math'

/**
 * The world map is Shor's circuit in standard notation: the first register |0⟩⊗2n on the top wire, the
 * second register |1⟩⊗n on the bottom wire, gates left to right, and the padlock where the wires end.
 * Each gate is a stop. The key walks along above the top wire.
 */
const W1 = 430 // first register
const W2 = 600 // second register
const TOP = 384 // top edge of every gate
const BOTTOM = 646 // bottom edge of gates that span both wires
const CHIP_Y = 694
const TIP = TOP - 18 // where the key marker's tip hovers
const X = [190, 340, 490, 660, 830, 995, 1185] // one per level
const WIRE_START = 236 // the circuit starts after the classical gcd step
const WIRE_END = 1110
const CASTLE = 6

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

interface Props {
  at: LevelId
  reached: number
  cleared: boolean
  N: number
  factors: [number, number] | null
  onPick: (level: LevelId) => void
  onArrive: (level: LevelId) => void
  /** set when Play is pressed: the key lifts off and the camera dives into that stop, then onLaunched */
  launching: LevelId | null
  onLaunched: (level: LevelId) => void
  /** the key arrives from the previous screen: it starts big and upright at the centre and drops onto its stop */
  animateIn: boolean
}

/** Cartheon status chip: neutral, waiting (amber, yours to play next), done (accent), open (green). */
function Chip({ x, text, kind }: { x: number; text: string; kind: 'neutral' | 'waiting' | 'done' | 'open' }) {
  const w = 22 + text.length * 7.6
  return (
    <g className={`chip ${kind}`} transform={`translate(${x} ${CHIP_Y})`}>
      <rect x={-w / 2} y="-13" width={w} height="26" />
      <text y="5" textAnchor="middle">
        {text}
      </text>
    </g>
  )
}

/** A measurement meter: arc and needle, standard circuit symbol. */
function Meter({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g className="meter-g">
      <rect className="tile" x={cx - 40} y={cy - 40} width="80" height="80" />
      <path className="meter-arc" d={`M${cx - 24} ${cy + 12} A26 26 0 0 1 ${cx + 24} ${cy + 12}`} />
      <path className="meter-arc" d={`M${cx} ${cy + 14} L${cx + 16} ${cy - 16}`} />
    </g>
  )
}

export function WorldMap({ at, reached, cleared, N, factors, onPick, onArrive, launching, onLaunched, animateIn }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const marker = useRef<SVGGElement>(null)
  const lift = useRef<SVGGElement>(null)
  const launched = useRef(onLaunched)
  useLayoutEffect(() => {
    launched.current = onLaunched
  })
  const placed = useRef<LevelId | null>(null)
  const arrive = useRef(onArrive)
  useLayoutEffect(() => {
    arrive.current = onArrive
  })

  // the key walks straight along the top wire to the chosen gate
  useLayoutEffect(() => {
    const el = marker.current
    if (!el) return
    const start = placed.current ?? at
    gsap.set(el, { x: X[start], y: TIP })
    if (start === at) {
      placed.current = at
      return
    }
    const tween = gsap.to(el, {
      x: X[at],
      duration: reducedMotion() ? 0 : 0.18 * Math.abs(at - start) + 0.1,
      ease: 'power1.inOut',
      onComplete: () => {
        placed.current = at
        arrive.current(at)
      },
    })
    return () => {
      tween.kill()
    }
  }, [at])

  // arrival from the title or a level: caught at the centre where the last screen left it, then dropped home
  useLayoutEffect(() => {
    if (!animateIn || reducedMotion() || !lift.current) return
    const ctx = gsap.context(() => {
      gsap
        .timeline()
        .from(lift.current, { x: 700 - X[at], y: 560 - TIP, scale: 4, transformOrigin: '50% 55%', duration: 0.75, ease: 'power3.inOut' })
        .to(lift.current, { y: -12, duration: 0.14, ease: 'power2.out' })
        .to(lift.current, { y: 0, duration: 0.3, ease: 'bounce.out' })
    })
    return () => ctx.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Play: the key floats up off the wire, spins upright into a dive, and the camera follows it into the gate
  useLayoutEffect(() => {
    if (launching === null || !svg.current || !lift.current) return
    const l = launching
    if (reducedMotion()) {
      launched.current(l)
      return
    }
    const cx = X[l]
    gsap.set(lift.current, { transformOrigin: '50% 55%' })
    const tl = gsap.timeline({ onComplete: () => launched.current(l) })
    tl.to(lift.current, { y: -46, scale: 1.25, duration: 0.42, ease: 'back.out(2)' })
      .to(lift.current, { rotation: 360, duration: 0.5, ease: 'power2.inOut' }, '-=0.1')
      .to(lift.current, { y: 40, scale: 9, duration: 0.55, ease: 'power3.in' }, '-=0.05')
      .to(svg.current, { attr: { viewBox: `${cx - 90} ${TIP - 70} 180 66` }, duration: 0.55, ease: 'power3.in' }, '<')
      .to(svg.current.querySelectorAll('.plate, .wire, .stop, .castle-win'), { opacity: 0, duration: 0.4, ease: 'power1.in' }, '<0.1')
    return () => {
      tl.kill()
    }
  }, [launching])

  const nq = qubitsFor(N)
  const open = cleared ? WIRE_END : X[Math.min(reached, CASTLE)]

  const stop = (level: LevelId, ring: { x: number; y: number; w: number; h: number }, body: ReactNode) => {
    const locked = level > reached
    const done = cleared || level < reached
    const l = LEVELS[level]
    const go = () => !locked && onPick(level)
    const key = (e: KeyboardEvent) => {
      if (!locked && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        e.stopPropagation()
        onPick(level)
      }
    }
    return (
      <g
        key={level}
        className={`stop${locked ? ' locked' : ''}${done ? ' done' : ''}${level === at ? ' sel' : ''}${level === CASTLE ? ' castle' : ''}`}
        role="button"
        tabIndex={locked ? -1 : 0}
        aria-label={`${courseOf(level)} ${l.name}${locked ? ', locked' : done ? ', cleared' : ''}`}
        aria-disabled={locked}
        onClick={go}
        onKeyDown={key}
      >
        <rect className="ring" x={ring.x - 8} y={ring.y - 8} width={ring.w + 16} height={ring.h + 16} />
        {body}
        <Chip
          x={X[level]}
          text={done ? `${l.name} ✓` : l.name}
          kind={level === CASTLE && cleared ? 'open' : done ? 'done' : level === reached ? 'waiting' : 'neutral'}
        />
      </g>
    )
  }

  const gate = (cx: number, cy: number, w: number, h: number, label: ReactNode, dashed = false) => (
    <>
      <rect className={`tile${dashed ? ' dashed' : ''}`} x={cx - w / 2} y={cy - h / 2} width={w} height={h} />
      <text className="glyph" x={cx} y={cy + 9} textAnchor="middle">
        {label}
      </text>
    </>
  )
  const span = (cx: number, w: number) => ({ x: cx - w / 2, y: TOP, w, h: BOTTOM - TOP })
  const sub = (t: string) => (
    <tspan dy="7" style={{ fontSize: '0.6em' }}>
      {t}
    </tspan>
  )
  const sup = (t: string) => (
    <tspan dy="-14" style={{ fontSize: '0.6em' }}>
      {t}
    </tspan>
  )

  return (
    <svg ref={svg} className={`worldmap${launching !== null ? ' launching' : ''}`} viewBox="60 300 1280 470" role="group" aria-label={`World 1, N = ${N}: Shor's circuit`}>
      <rect className="plate" x="100" y="340" width="1210" height="390" />

      {/* the two registers */}
      <line className="wire" x1={WIRE_START} y1={W1} x2={WIRE_END} y2={W1} />
      <line className="wire" x1={WIRE_START} y1={W2} x2={WIRE_END} y2={W2} />
      <line className="wire lit" x1={WIRE_START} y1={W1} x2={open} y2={W1} />
      <line className="wire lit" x1={WIRE_START} y1={W2} x2={open} y2={W2} />

      {stop(0, span(X[0], 92), gate(X[0], (TOP + BOTTOM) / 2, 92, BOTTOM - TOP, 'gcd', true))}
      {stop(
        1,
        span(X[1], 104),
        <>
          <rect className="tile" x={X[1] - 52} y={TOP} width="104" height={BOTTOM - TOP} />
          <text className="glyph small" x={X[1]} y={W1 + 8} textAnchor="middle">
            |0⟩{sup(`⊗${2 * nq}`)}
          </text>
          <text className="glyph small" x={X[1]} y={W2 + 8} textAnchor="middle">
            |1⟩{sup(`⊗${nq}`)}
          </text>
        </>,
      )}
      {stop(2, { x: X[2] - 50, y: TOP, w: 100, h: 92 }, gate(X[2], W1, 100, 92, <>H{sup(`⊗${2 * nq}`)}</>))}
      {stop(3, span(X[3], 110), gate(X[3], (TOP + BOTTOM) / 2, 110, BOTTOM - TOP, <>U{sub('f')}</>))}
      {stop(4, { x: X[4] - 58, y: TOP, w: 116, h: 92 }, gate(X[4], W1, 116, 92, 'QFT†'))}
      {stop(
        5,
        { x: X[5] - 40, y: W1 - 40, w: 80, h: W2 - W1 + 80 },
        <>
          <Meter cx={X[5]} cy={W1} />
          <Meter cx={X[5]} cy={W2} />
        </>,
      )}
      {stop(
        CASTLE,
        { x: X[CASTLE] - 80, y: TOP - 4, w: 160, h: BOTTOM - TOP + 8 },
        <>
          <path
            className="shackle-map"
            d={`M${X[CASTLE] - 42} 470 V438 A42 42 0 0 1 ${X[CASTLE] + 42} 438 V470`}
            transform={cleared ? 'translate(0 -30)' : undefined}
          />
          <rect className="lockbody" x={X[CASTLE] - 72} y="466" width="144" height="150" />
          <text className="castle-n" x={X[CASTLE]} y="510" textAnchor="middle">
            N = {N}
          </text>
          <circle className="keyhole" cx={X[CASTLE]} cy="548" r="11" />
          <rect className="keyhole" x={X[CASTLE] - 4.5} y="552" width="9" height="26" />
        </>,
      )}
      {cleared && factors && (
        <text className="castle-win" x={X[CASTLE]} y={CHIP_Y + 46} textAnchor="middle">
          {N} = {factors[0]} × {factors[1]}
        </text>
      )}

      {/* the player: your key a, in the accent because it is your selection */}
      <g ref={marker} className="marker" aria-hidden="true">
        <g className="bob">
          <g ref={lift}>
            <KeyShape />
          </g>
        </g>
      </g>
    </svg>
  )
}
