import { useEffect, useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { SPECTRUM_BINS, type LockState } from '../shor/model'

interface Props {
  state: LockState
  N: number
  a: number
  /** text under the lock at the end: "15 = 3 × 5" or the reason it jammed */
  verdict: { text: string; ok: boolean } | null
  /** set when leaving for the map: the key lifts back to the centre, upright and big, then onLeft */
  leaving: boolean
  onLeft: () => void
  /** bumped each time the key should try the keyway and fail: it slides up, jitters, and backs out */
  tryInsert: number
}

const KEY_OUT = -330
/** Camera: always centred on the lock (x 750); wide while the key waits outside, closer once it is in. */
const VIEW_OUT = '110 10 1280 600'
const VIEW_IN = '360 10 780 600'
const BLADE_X = 552
const BLADE_W = 332
const BOW_CX = 501
const BOW_CY = 425
const SHEAR_Y = 330
const PIN_LIFT = 22
/** baseline and full height of the code strip at the bottom of the lock window */
const SPEC_Y = 530
const SPEC_H = 40
const BUMP_H = 16

/**
 * The blade: pointed tip, and cut teeth along the top edge pointing up into the pins. The teeth are the key a
 * itself, written in binary with n bits (most significant nearest the bow): a 1 is a tall tooth, a 0 a short one.
 * Change a and the teeth change. The register bumps stand taller (BUMP_H) on the same edge.
 */
/** the first stretch of the edge (by the bow) carries the teeth of a; the register bumps follow after a gap */
const TEETH_W = 96
const BUMPS_X = BLADE_X + TEETH_W + 14
const BUMPS_W = BLADE_W - TEETH_W - 14 - 30

function bladePath(a: number, n: number): string {
  const end = BLADE_X + BLADE_W - 18
  const bits = a.toString(2).padStart(n, '0').slice(-n)
  const start = BLADE_X + 10
  const step = TEETH_W / n
  let d = `M${BLADE_X} 448 V416 H${start}`
  for (let i = 0; i < n; i++) {
    const x = start + i * step
    const h = bits[i] === '1' ? 9 : 3
    d += ` L${x + step * 0.25} ${416 - h} H${x + step * 0.75} L${x + step} 416`
  }
  return `${d} H${end} L${BLADE_X + BLADE_W} 432 L${end} 448 Z`
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function LockStage({ state, N, a, verdict, leaving, onLeft, tryInsert }: Props) {
  const left = useRef(onLeft)
  useLayoutEffect(() => {
    left.current = onLeft
  })
  const root = useRef<SVGSVGElement>(null)
  const spin = useRef<gsap.core.Tween | null>(null)
  const firstPaint = useRef(true)

  const width = state.bumps.length
  const n = state.pins.length
  const bumpGap = BUMPS_W / Math.max(width, 1)
  const bw = Math.min(26, bumpGap - 2)
  const bumpX = (i: number) => BUMPS_X + i * bumpGap
  const pinGap = n > 4 ? 280 / (n - 1) : 70
  const pinX = (p: number) => (n > 4 ? 610 : 645) + p * pinGap
  const pw = Math.min(22, pinGap - 10)
  const cw = Math.min(34, pinGap - 2)

  // entrance: the key comes in from the map still upright and big at the centre, swings level and lands on the
  // exact spot it holds in this level, with a small bounce. A context so StrictMode's rerun starts clean.
  useLayoutEffect(() => {
    if (reducedMotion() || !root.current) return
    const bowX = BOW_CX + (state.keyInserted ? 0 : KEY_OUT)
    const ctx = gsap.context(() => {
      gsap
        .timeline()
        .from(root.current, { opacity: 0, duration: 0.25, ease: 'power1.out' })
        .from(
          '[data-keyin]',
          { x: 480 - bowX, y: 250 - BOW_CY, rotation: 90, scale: 2.4, svgOrigin: `${bowX} ${BOW_CY}`, duration: 0.8, ease: 'power3.inOut' },
          0,
        )
        .to('[data-keyin]', { y: -14, duration: 0.14, ease: 'power2.out' })
        .to('[data-keyin]', { y: 0, duration: 0.3, ease: 'bounce.out' })
    }, root)
    return () => ctx.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // a failed try: the key pushes into the keyway, jams and rattles, then backs out to where it waited
  // only a new try plays it: a level that mounts with an old count must not rattle
  const triedAt = useRef(tryInsert)
  useLayoutEffect(() => {
    if (tryInsert === triedAt.current) return
    triedAt.current = tryInsert
    if (reducedMotion() || !root.current) return
    const q = gsap.utils.selector(root)
    const tl = gsap
      .timeline()
      .to(q('[data-key]'), { x: KEY_OUT + 250, duration: 0.35, ease: 'power2.in' })
      .to(q('[data-key]'), { x: KEY_OUT + 238, rotation: 2.5, svgOrigin: `${BOW_CX + KEY_OUT} ${BOW_CY}`, duration: 0.05, yoyo: true, repeat: 7, ease: 'none' })
      .to(q('[data-key]'), { rotation: 0, duration: 0.05 })
      .to(q('[data-key]'), { x: KEY_OUT, duration: 0.4, ease: 'power2.out' })
    return () => {
      tl.kill()
    }
  }, [tryInsert])

  // exit: the entrance in reverse, so the map can catch the key at the centre
  useLayoutEffect(() => {
    if (!leaving || !root.current) return
    const bowX = BOW_CX + (state.keyInserted ? 0 : KEY_OUT)
    const q = gsap.utils.selector(root)
    const tl = gsap
      .timeline({ onComplete: () => left.current() })
      .to(q('[data-keyin]'), { x: 480 - bowX, y: 250 - BOW_CY, rotation: 90, scale: 2.4, svgOrigin: `${bowX} ${BOW_CY}`, duration: 0.5, ease: 'power3.in' })
      .to(q('.body, .window, [data-shackle], [data-verdict], text, clipPath ~ g'), { opacity: 0, duration: 0.3 }, 0)
    return () => {
      tl.kill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving])

  useEffect(() => {
    const q = gsap.utils.selector(root)
    const d = firstPaint.current || reducedMotion() ? 0 : 0.7
    firstPaint.current = false

    gsap.to(q('[data-key]'), { x: state.keyInserted ? 0 : KEY_OUT, duration: d * 1.3, ease: 'power3.inOut' })
    // React never changes the viewBox prop, so GSAP owns it and can tween the camera
    if (root.current) gsap.to(root.current, { attr: { viewBox: state.keyInserted ? VIEW_IN : VIEW_OUT }, duration: d * 1.3, ease: 'power3.inOut' })

    spin.current?.kill()
    spin.current = null
    if (state.dialSpinning && !reducedMotion()) {
      spin.current = gsap.fromTo(
        q('[data-bow]'),
        { rotation: 0 },
        { rotation: 360, svgOrigin: `${BOW_CX} ${BOW_CY}`, duration: 3, repeat: -1, ease: 'none' },
      )
    } else {
      gsap.to(q('[data-bow]'), { rotation: state.dialSpinning ? 90 : 0, svgOrigin: `${BOW_CX} ${BOW_CY}`, duration: d })
    }

    state.bumps.forEach((b, i) => {
      const h = b === 'cut' ? BUMP_H : 0
      gsap.to(q(`[data-bump="${i}"]`), { attr: { height: h, y: 416 - h }, duration: d, ease: 'power2.out' })
      gsap.to(q(`[data-ghost="${i}"]`), { autoAlpha: b === 'ghost' ? 1 : 0, duration: d })
      gsap.to(q(`[data-bit="${i}"]`), { autoAlpha: state.bumpBits ? 1 : 0, duration: d })
    })

    state.pins.forEach((pin, p) => {
      const lift = pin.lift * PIN_LIFT
      const ghosted = pin.ghosts !== null
      gsap.to(q(`[data-keypin="${p}"]`), {
        attr: { y: SHEAR_Y - lift, height: 70 + lift },
        opacity: ghosted ? 0.18 : 1,
        duration: d,
        ease: 'power2.out',
      })
      gsap.to(q(`[data-driver="${p}"]`), { attr: { height: 58 - lift }, opacity: ghosted ? 0.25 : 1, duration: d })
      gsap.to(q(`[data-pinghosts="${p}"]`), { autoAlpha: ghosted ? 1 : 0, duration: d })
    })

    // the code strip: on the turn the flat band falls away from the left, leaving evenly spaced peaks
    state.spectrum.forEach((h, i) => {
      const px = h * SPEC_H
      gsap.to(q(`[data-spec="${i}"]`), {
        attr: { y: SPEC_Y - px, height: px },
        duration: d,
        delay: state.dialSpinning ? i * 0.012 : 0,
        ease: 'power2.out',
      })
    })

    gsap.to(q('[data-shackle]'), {
      y: state.shackleOpen ? -64 : 0,
      duration: d * 1.2,
      ease: state.shackleOpen ? 'back.out(1.6)' : 'power2.inOut',
    })
    if (state.jammed && d > 0) {
      gsap.fromTo(q('[data-key]'), { rotation: 0 }, { rotation: -6, svgOrigin: '700 432', duration: 0.12, yoyo: true, repeat: 3 })
    }
    gsap.to(q('[data-verdict]'), { autoAlpha: verdict ? 1 : 0, duration: d })

    return () => {
      spin.current?.kill()
    }
  }, [state, verdict])

  return (
    <div className="stage">
      <svg ref={root} viewBox={VIEW_OUT} role="img" aria-label={`Cutaway padlock N = ${N} with a ${width}-bump key and ${n} pins`}>
        <defs>
          <clipPath id="win">
            <rect x="588" y="236" width="324" height="220" />
          </clipPath>
        </defs>

        <g data-shackle>
          <path className="shackle" d="M640 330 V140 A110 110 0 0 1 860 140 V212" />
        </g>
        <rect className="body" x="560" y="200" width="380" height="280" />
        <text className="svl fg" x="750" y="226" textAnchor="middle" style={{ fontSize: 15, letterSpacing: '0.12em' }}>
          N = {N}
        </text>
        <rect className="window" x="588" y="236" width="324" height="220" />
        {/* the keyway: a plain gap through the left wall at blade height */}
        <rect className="keyway" x="559" y="404" width="30" height="48" />

        <g clipPath="url(#win)">
          {state.pins.map((pin, p) => {
            const px = pinX(p)
            const sw = Math.min(8, pw / 2)
            const zig = [`${px - sw},250`]
            for (let s = 0; s < 4; s++) zig.push(`${px + (s % 2 ? sw : -sw)},${255 + s * 5}`)
            zig.push(`${px},272`)
            // a long cycle would be hundreds of slivers; a dozen is enough to read as "every reply at once"
            const ghosts = (pin.ghosts ?? []).slice(0, 12)
            const gw = Math.min(10, (pw + 8) / Math.max(ghosts.length, 1))
            return (
              <g key={p}>
                <rect className="chamber" x={px - cw / 2} y="248" width={cw} height="152" />
                <polyline className="spring" points={zig.join(' ')} />
                <rect className="driver" data-driver={p} x={px - pw / 2} y="272" width={pw} height="58" />
                <g data-pinghosts={p} opacity="0">
                  {ghosts.map((g, j) => {
                    const lift = g.lift * PIN_LIFT
                    const cx = px + (j - (ghosts.length - 1) / 2) * (gw + 1)
                    return (
                      <rect
                        key={j}
                        className={`gpin r${g.colorIndex % 6}`}
                        x={cx - gw / 2}
                        y={SHEAR_Y - lift}
                        width={gw}
                        height={70 + lift}
                      />
                    )
                  })}
                </g>
                <rect className={`keypin ${pin.tone}`} data-keypin={p} x={px - pw / 2} y={SHEAR_Y} width={pw} height="70" />
              </g>
            )
          })}
          <line className="shear" x1="588" y1={SHEAR_Y} x2="912" y2={SHEAR_Y} />
          <rect className="chamber" x="588" y="400" width="324" height="56" />
        </g>

        <g data-keyin>
        <g data-key>
          <g data-bow>
            <path
              className="brass"
              fillRule="evenodd"
              d={`M${BOW_CX - 46} ${BOW_CY} a46 46 0 1 0 92 0 a46 46 0 1 0 -92 0 Z M${BOW_CX - 15} ${BOW_CY} a15 15 0 1 1 30 0 a15 15 0 1 1 -30 0 Z`}
            />
            {Array.from({ length: 16 }, (_, i) => {
              const th = (i / 16) * 2 * Math.PI
              const major = i % 4 === 0
              return (
                <line
                  key={i}
                  x1={BOW_CX + (major ? 28 : 33) * Math.cos(th)}
                  y1={BOW_CY + (major ? 28 : 33) * Math.sin(th)}
                  x2={BOW_CX + 40 * Math.cos(th)}
                  y2={BOW_CY + 40 * Math.sin(th)}
                  className="ktick"
                  strokeWidth={major ? 2.4 : 1.4}
                />
              )
            })}
          </g>
          <text className="svl fg" x={BOW_CX} y={BOW_CY + 66} textAnchor="middle" style={{ fontSize: 14, fontWeight: 600 }}>
            a = {a}
          </text>
          <rect className="brass" x={BLADE_X - 12} y="408" width="14" height="48" />
          <path className="brass" d={bladePath(a, n)} />
          <line className="kgroove" x1={BLADE_X + 8} y1="439" x2={BLADE_X + BLADE_W - 26} y2="439" />
          {state.bumps.map((_, i) => {
            const x = bumpX(i)
            return (
              <g key={i}>
                <rect className="bsolid" data-bump={i} x={x} y="416" width={bw} height="0" />
                <g className="ghost" data-ghost={i} opacity="0">
                  <rect x={x} y={416 - BUMP_H} width={bw} height={BUMP_H} />
                </g>
                <text className="bit" data-bit={i} x={x + bw / 2} y="476" opacity="0" style={width > 12 ? { fontSize: 10 } : undefined}>
                  {state.bumpBits?.[i] ?? 0}
                </text>
              </g>
            )
          })}
        </g>
        </g>

        <g className="spec-strip">
          {/* below the lock: the codes the key holds, zoomed to a few beats of the period */}
          {Array.from({ length: SPECTRUM_BINS }, (_, i) => (
            <rect key={i} className="spec" data-spec={i} x={570 + (i * 360) / SPECTRUM_BINS} y={SPEC_Y} width={360 / SPECTRUM_BINS - 0.8} height="0" />
          ))}
        </g>

        <g data-verdict opacity="0">
          <text className={`open ${verdict?.ok ? '' : 'bad'}`} x="750" y="560" textAnchor="middle">
            {verdict?.text ?? ''}
          </text>
        </g>
      </svg>
    </div>
  )
}
