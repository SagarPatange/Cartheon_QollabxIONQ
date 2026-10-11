/**
 * Pure arithmetic for Shor's algorithm on a small N.
 * Nothing in here knows about locks, keys or React.
 */

export const gcd = (x: number, y: number): number => (y === 0 ? Math.abs(x) : gcd(y, x % y))

export function modpow(base: number, exp: number, mod: number): number {
  let result = 1
  let b = base % mod
  let e = exp
  while (e > 0) {
    if (e & 1) result = (result * b) % mod
    b = (b * b) % mod
    e >>= 1
  }
  return result
}

/** Smallest R ≥ 1 with a^R ≡ 1 (mod N). Requires gcd(a, N) = 1. */
export function period(a: number, N: number): number {
  for (let r = 1; r <= N; r++) if (modpow(a, r, N) === 1) return r
  throw new Error(`no period: gcd(${a}, ${N}) must be 1`)
}

/** The cycle of remainders a^0, a^1, …, a^(R−1) mod N. */
export const remainders = (a: number, N: number): number[] =>
  Array.from({ length: period(a, N) }, (_, x) => modpow(a, x, N))

/** Number of qubits needed to hold N. */
export const qubitsFor = (N: number): number => Math.ceil(Math.log2(N))

/**
 * Probability of measuring k on the counting register after the inverse QFT,
 * for the branch of the superposition whose work register holds remainder index r.
 * Q = 2^(2n). Exact sum over x ≡ r (mod R), normalized to sum 1.
 */
export function iqftDistribution(R: number, Q: number, r = 0): Float64Array {
  // the sum over x = r, r+R, … is a geometric series, so each k has a closed form: |Σ e^(−2πi x k/Q)|² =
  // sin²(π M R k/Q) / sin²(π R k/Q) with M terms. O(Q) instead of O(Q²/R), which matters once Q is 2^20.
  const M = Math.ceil((Q - r) / R)
  const p = new Float64Array(Q)
  let total = 0
  for (let k = 0; k < Q; k++) {
    const phi = (Math.PI * R * k) / Q
    const s = Math.sin(phi)
    p[k] = Math.abs(s) < 1e-12 ? M * M : (Math.sin(M * phi) / s) ** 2
    total += p[k]
  }
  for (let k = 0; k < Q; k++) p[k] /= total
  return p
}

/** Indices whose probability is above `threshold` of the maximum. */
export function peaks(p: Float64Array, threshold = 0.01): number[] {
  let max = 0
  for (const v of p) max = Math.max(max, v)
  const out: number[] = []
  p.forEach((v, k) => {
    if (v > max * threshold) out.push(k)
  })
  return out
}

/** Draw one k from a probability vector. `u` in [0, 1) lets callers inject randomness. */
export function sampleIndex(p: Float64Array, u = Math.random()): number {
  let c = 0
  for (let k = 0; k < p.length; k++) {
    c += p[k]
    if (u < c) return k
  }
  return p.length - 1
}

/** Denominators of the continued-fraction convergents of k/Q, in order. */
export function convergentDenominators(k: number, Q: number): number[] {
  const out: number[] = []
  let num = k
  let den = Q
  let kPrev = 1 // k₋₂
  let kCur = 0 // k₋₁
  while (den !== 0 && out.length < 16) {
    const q = Math.floor(num / den)
    ;[kPrev, kCur] = [kCur, q * kCur + kPrev]
    out.push(kCur)
    ;[num, den] = [den, num % den]
  }
  return out
}

/** Best period guess from one measurement: smallest convergent denominator ≤ N that is a period. */
export function periodFromMeasurement(k: number, Q: number, a: number, N: number): number | null {
  if (k === 0) return null
  for (const d of convergentDenominators(k, Q)) {
    if (d > N) break
    if (modpow(a, d, N) === 1) return d
  }
  return null
}

export type ReadOutcome =
  | { kind: 'no-info' }
  | { kind: 'wrong-period'; guess: number; check: number }
  | { kind: 'odd-period'; R: number }
  | { kind: 'trivial-root'; R: number; root: number }
  | { kind: 'factored'; R: number; root: number; p: number; q: number }

/** Classical post-processing of one measured k. */
export function readKey(k: number, Q: number, a: number, N: number): ReadOutcome {
  if (k === 0) return { kind: 'no-info' }
  const denominators = convergentDenominators(k, Q).filter((d) => d <= N)
  const guess = denominators[denominators.length - 1]
  const R = periodFromMeasurement(k, Q, a, N)
  if (R === null) return { kind: 'wrong-period', guess, check: modpow(a, guess, N) }
  if (R % 2 === 1) return { kind: 'odd-period', R }
  const root = modpow(a, R / 2, N)
  if (root === N - 1) return { kind: 'trivial-root', R, root }
  const p = gcd(root - 1, N)
  const q = gcd(root + 1, N)
  return { kind: 'factored', R, root, p: Math.min(p, q), q: Math.max(p, q) }
}

export const toBits = (value: number, width: number): number[] =>
  Array.from({ length: width }, (_, i) => (value >> (width - 1 - i)) & 1)
