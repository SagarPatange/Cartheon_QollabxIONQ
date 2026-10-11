/**
 * The bridge between Shor's algorithm and the lock.
 * A `Run` is the algorithm's state (N, a, what was measured).
 * A `Level` is one step of the algorithm.
 * `lockState(level, run)` says what the padlock looks like at that step.
 */
import {
  gcd,
  iqftDistribution,
  peaks,
  period,
  qubitsFor,
  readKey,
  remainders,
  sampleIndex,
  toBits,
  type ReadOutcome,
} from './math'

export const LEVEL_IDS = [0, 1, 2, 3, 4, 5, 6] as const
export type LevelId = (typeof LEVEL_IDS)[number]

export interface Run {
  N: number
  a: number
  /** measured counting register, null until level 5 */
  k: number | null
  /** index into the remainder cycle that the work register collapsed to */
  dIndex: number | null
}

export interface Derived {
  n: number
  Q: number
  R: number
  rem: number[]
  dist: Float64Array
  peakKs: number[]
  fits: boolean
  outcome: ReadOutcome | null
}

let cached: { key: string; d: Derived } | null = null

/** Everything that follows from a run. Q reaches 2^20 for N near 1000, so the last result is cached. */
export function derive(run: Run): Derived {
  const key = `${run.N},${run.a},${run.k},${run.dIndex}`
  if (cached?.key === key) return cached.d
  const d = deriveUncached(run)
  cached = { key, d }
  return d
}

function deriveUncached(run: Run): Derived {
  const n = qubitsFor(run.N)
  const Q = 1 << (2 * n)
  const fits = gcd(run.a, run.N) === 1
  if (!fits) {
    return { n, Q, R: 0, rem: [], dist: new Float64Array(Q), peakKs: [], fits, outcome: null }
  }
  const R = period(run.a, run.N)
  const dist = iqftDistribution(R, Q)
  return {
    n,
    Q,
    R,
    rem: remainders(run.a, run.N),
    dist,
    // 0.1 of the tallest: one or two codes per real peak, without the side lobes a large Q brings
    peakKs: peaks(dist, 0.1),
    fits,
    outcome: run.k === null ? null : readKey(run.k, Q, run.a, run.N),
  }
}

export const newRun = (N: number, a: number): Run => ({ N, a, k: null, dIndex: null })

/** Collapse both registers. Pass `rng` for determinism. */
export function measure(run: Run, rng: () => number = Math.random): Run {
  const d = derive(run)
  if (!d.fits) return run
  return { ...run, k: sampleIndex(d.dist, rng()), dIndex: Math.floor(rng() * d.R) }
}

export type BumpState = 'flat' | 'cut' | 'ghost'
export type PinTone = 'steel' | 'measured' | 'set' | 'jammed'

export interface PinState {
  /** 0 = resting on the shear line, 1 = fully raised */
  lift: number
  tone: PinTone
  /** one ghost per remainder in the cycle, or null when the pin is definite */
  ghosts: { lift: number; colorIndex: number }[] | null
}

export interface LockState {
  keyInserted: boolean
  dialSpinning: boolean
  bumps: BumpState[]
  bumpBits: number[] | null
  pins: PinState[]
  shackleOpen: boolean
  jammed: boolean
  /** the counting register's code probabilities, zoomed to the first few periods: SPECTRUM_BINS heights 0..1 */
  spectrum: number[]
}

export const SPECTRUM_BINS = 96
const SPECTRUM_PEAKS = 8

/**
 * Heights for the strip at the bottom of the lock. It shows codes 0 … 8·Q/R (eight beats of the period), so a
 * real Q of a million still shows its peaks: flat before H, even after H, evenly spaced peaks after the turn,
 * one spike once measured.
 */
function spectrum(level: LevelId, run: Run, d: Derived): number[] {
  const bins = SPECTRUM_BINS
  if (!d.fits || level < 2) return Array<number>(bins).fill(0)
  const span = Math.min(d.Q, Math.round((SPECTRUM_PEAKS * d.Q) / d.R))
  const binOf = (k: number) => Math.floor((k * bins) / span)
  if (level <= 3) return Array<number>(bins).fill(0.35)
  if (level >= 5 && run.k !== null) {
    const out = Array<number>(bins).fill(0)
    const b = binOf(run.k % span)
    if (b < bins) out[b] = 1
    return out
  }
  const out = Array<number>(bins).fill(0)
  for (let k = 0; k < span; k++) {
    const b = binOf(k)
    out[b] = Math.max(out[b], d.dist[k])
  }
  const max = Math.max(...out) || 1
  return out.map((v) => v / max)
}

const WORK_INIT = 1 // second register starts in |1⟩

export function lockState(level: LevelId, run: Run): LockState {
  const d = derive(run)
  const width = 2 * d.n
  const initPinBits = toBits(WORK_INIT, d.n)

  let bumps: BumpState[] = Array<BumpState>(width).fill('flat')
  let bumpBits: number[] | null = null
  if (level === 2 || level === 3) bumps = Array<BumpState>(width).fill('ghost')
  if (level === 4 && d.fits) {
    const rows = d.peakKs.map((k) => toBits(k, width))
    bumps = Array.from({ length: width }, (_, i) => {
      const first = rows[0]?.[i] ?? 0
      const varies = rows.some((r) => r[i] !== first)
      return varies ? 'ghost' : first ? 'cut' : 'flat'
    })
  }
  if (level >= 5 && run.k !== null) {
    bumpBits = toBits(run.k, width)
    bumps = bumpBits.map((b) => (b ? 'cut' : 'flat'))
  }

  const factored = d.outcome?.kind === 'factored'
  const jammed = level === 6 && !factored
  const pins: PinState[] = Array.from({ length: d.n }, (_, p) => {
    const ghosts =
      (level === 3 || level === 4) && d.fits
        ? d.rem.map((value, j) => ({ lift: toBits(value, d.n)[p], colorIndex: j }))
        : null
    let lift = initPinBits[p]
    let tone: PinTone = 'steel'
    if (level === 5 && run.dIndex !== null) {
      lift = toBits(d.rem[run.dIndex], d.n)[p]
      tone = 'measured'
    }
    if (level === 6) {
      if (factored) {
        lift = 0
        tone = 'set'
      } else {
        lift = run.dIndex !== null ? toBits(d.rem[run.dIndex], d.n)[p] : lift
        tone = 'jammed'
      }
    }
    return { lift, tone, ghosts }
  })

  return {
    keyInserted: level >= 3,
    dialSpinning: level === 4,
    bumps,
    bumpBits,
    pins,
    shackleOpen: level === 6 && factored,
    jammed,
    spectrum: spectrum(level, run, d),
  }
}

/** Keys that fit the keyway (coprime) and keys that open the lock by gcd alone. */
export function keyOptions(N: number): { a: number; fits: boolean }[] {
  return Array.from({ length: N - 2 }, (_, i) => i + 2).map((a) => ({ a, fits: gcd(a, N) === 1 }))
}
