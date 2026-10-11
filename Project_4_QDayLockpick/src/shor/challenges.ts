/**
 * What the player has to do in each level before the explanation is revealed. A level is a short list of steps:
 * an action that moves the lock on to this level's state, and questions that ask the player to predict what
 * the lock will show. Nothing here gives the answer away; the explanation in levels.ts appears once every step
 * is done.
 */
import { convergentDenominators, modpow, periodFromMeasurement } from './math'
import type { Derived, LevelId, Run } from './model'

export type Step =
  | { kind: 'act'; goal: string; label: string }
  | { kind: 'ask'; goal: string; options: string[]; answer: string; hint: string }

/** Up to four distinct options containing the answer, in a fixed shuffled order so the answer is not always first. */
function choices(answer: number | string, wrong: (number | string)[]): { options: string[]; answer: string } {
  const a = String(answer)
  const pool = [a, ...wrong.map(String).filter((w) => w !== a)]
  const unique = [...new Set(pool)].slice(0, 4)
  const order = unique.map((o, i) => ({ o, s: (o.length * 7 + i * 13) % 5 })).sort((x, y) => x.s - y.s)
  return { options: order.map((x) => x.o), answer: a }
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
/** 2 to a power, written with superscripts: 2²⁰ */
const pow2 = (e: number) => `2${String(e).replace(/\d/g, (c) => SUP[+c])}`

export function stepsFor(level: LevelId, run: Run, d: Derived): Step[] {
  if (!d.fits) return []
  switch (level) {
    case 1:
      return [
        {
          kind: 'ask',
          goal: `Writing ${run.N} takes n = ⌈log₂ ${run.N}⌉ bits. The key gets 2n bumps to count, the lock n pins to answer. How many qubits in all?`,
          ...choices(3 * d.n, [d.n, 2 * d.n, 4 * d.n]),
          hint: `Find n first: the smallest power of 2 above ${run.N} is 2^n. Then add 2n and n.`,
        },
      ]
    case 2:
      return [
        { kind: 'act', goal: 'Put every bump into superposition.', label: 'Apply H to the key' },
        {
          kind: 'ask',
          goal: `Each of the ${2 * d.n} bumps is 0 and 1 at once, so the codes multiply: 2 × 2 × … , once per bump. How many codes?`,
          ...choices(pow2(2 * d.n), [pow2(d.n), String(2 * d.n), `2 × ${2 * d.n}`]),
          hint: 'Each bump doubles the number of codes.',
        },
      ]
    case 3: {
      const next = d.rem[2 % d.R]
      return [
        { kind: 'act', goal: 'Insert the key into the lock and watch the pins.', label: 'Insert the key' },
        {
          kind: 'ask',
          goal: `For code x the pins answer ${run.a}^x mod ${run.N}. The replies start ${d.rem[0]}, ${d.rem[1]}, … What comes next?`,
          ...choices(next, [(next * run.a) % run.N, next + run.a, (run.a * 2) % run.N]),
          hint: `Multiply the last reply by ${run.a}, then take the remainder after dividing by ${run.N}.`,
        },
        {
          kind: 'ask',
          goal: `The replies repeat after some period R, which could be in the hundreds. How many codes did the lock just answer?`,
          ...choices(d.Q.toLocaleString('en'), ['1', String(d.n), String(2 * d.n)]),
          hint: 'The key holds every code at once, and the lock answered the key.',
        },
      ]
    }
    case 4:
      return [
        { kind: 'act', goal: 'Turn the key and let the codes interfere.', label: 'Turn the key' },
        {
          kind: 'ask',
          goal: 'After the turn, which codes are left standing?',
          ...choices('Evenly spaced peaks', ['Every code, equally', 'Exactly one code', 'Random noise']),
          hint: 'Codes that keep time with the hidden rhythm add up; the rest cancel.',
        },
      ]
    case 5:
      return [
        { kind: 'act', goal: 'Look inside the lock. Measuring will force one outcome.', label: 'Measure' },
        {
          kind: 'ask',
          goal: 'The key froze into one code k. If you ran the whole thing again, would you get the same k?',
          ...choices('No, another peak at random', ['Yes, always the same', 'Always k = 0']),
          hint: 'Measuring picks one of the surviving peaks by chance.',
        },
      ]
    case 6: {
      const k = run.k ?? 0
      const R = k === 0 ? null : periodFromMeasurement(k, d.Q, run.a, run.N)
      if (R === null) return []
      const others = convergentDenominators(k, d.Q).filter((x) => x > 1 && x <= run.N && x !== R)
      const dens = [R, ...new Set(others), R * 2 <= run.N ? R * 2 : R + 1].filter((x, i, xs) => xs.indexOf(x) === i).slice(0, 4).sort((x, y) => x - y)
      const label = (x: number) => `${x}  →  ${modpow(run.a, x, run.N)}`
      return [
        {
          kind: 'ask',
          goal: `The fraction ${k}/${d.Q} is close to j/R. Its continued fraction gives these guesses for R, each tested as ${run.a}^R mod ${run.N}. Which one is the period?`,
          options: dens.map(label),
          answer: label(R),
          hint: `The period is the R that brings ${run.a}^R back to 1.`,
        },
      ]
    }
    default:
      return []
  }
}
