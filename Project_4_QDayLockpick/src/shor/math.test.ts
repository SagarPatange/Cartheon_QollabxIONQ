import { describe, expect, it } from 'vitest'
import {
  convergentDenominators,
  gcd,
  iqftDistribution,
  modpow,
  peaks,
  period,
  readKey,
  remainders,
  sampleIndex,
  toBits,
} from './math'

const N = 15
const Q = 256

describe('arithmetic', () => {
  it('gcd and modpow', () => {
    expect(gcd(7, 15)).toBe(1)
    expect(gcd(6, 15)).toBe(3)
    expect(modpow(7, 2, 15)).toBe(4)
    expect(modpow(7, 4, 15)).toBe(1)
  })

  it('periods for every coprime key of 15', () => {
    const expected: Record<number, number> = { 2: 4, 4: 2, 7: 4, 8: 4, 11: 2, 13: 4, 14: 2 }
    for (const [a, R] of Object.entries(expected)) expect(period(+a, N)).toBe(R)
    expect(remainders(7, N)).toEqual([1, 7, 4, 13])
  })
})

describe('inverse QFT', () => {
  it('puts all probability on multiples of Q/R', () => {
    const p = iqftDistribution(4, Q)
    expect(peaks(p)).toEqual([0, 64, 128, 192])
    expect(p[64]).toBeCloseTo(0.25, 6)
    expect(p[65]).toBeCloseTo(0, 9)
  })

  it('is the same for every branch r', () => {
    const p0 = iqftDistribution(4, Q, 0)
    const p2 = iqftDistribution(4, Q, 2)
    for (let k = 0; k < Q; k++) expect(p2[k]).toBeCloseTo(p0[k], 9)
  })

  it('samples from the peaks only', () => {
    const p = iqftDistribution(4, Q)
    for (const u of [0, 0.1, 0.3, 0.6, 0.99]) expect([0, 64, 128, 192]).toContain(sampleIndex(p, u))
  })
})

describe('reading the key', () => {
  it('continued fractions', () => {
    expect(convergentDenominators(192, Q)).toEqual([1, 1, 4])
    expect(convergentDenominators(64, Q)).toEqual([1, 4])
    expect(convergentDenominators(128, Q)).toEqual([1, 2])
  })

  it('factors 15 from a good measurement', () => {
    expect(readKey(192, Q, 7, N)).toEqual({ kind: 'factored', R: 4, root: 4, p: 3, q: 5 })
    expect(readKey(64, Q, 2, N)).toEqual({ kind: 'factored', R: 4, root: 4, p: 3, q: 5 })
    expect(readKey(128, Q, 11, N)).toEqual({ kind: 'factored', R: 2, root: 11, p: 3, q: 5 })
  })

  it('reports the false set when k lands on a sub-harmonic', () => {
    expect(readKey(128, Q, 7, N)).toEqual({ kind: 'wrong-period', guess: 2, check: 4 })
    expect(readKey(0, Q, 7, N)).toEqual({ kind: 'no-info' })
  })

  it('rejects the key whose square root is trivial', () => {
    expect(readKey(128, Q, 14, N)).toEqual({ kind: 'trivial-root', R: 2, root: 14 })
  })

  it('bits', () => {
    expect(toBits(192, 8)).toEqual([1, 1, 0, 0, 0, 0, 0, 0])
    expect(toBits(4, 4)).toEqual([0, 1, 0, 0])
  })
})
