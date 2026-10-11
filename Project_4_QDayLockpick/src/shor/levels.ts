/**
 * One level per step of Shor's algorithm. Text is generated from the live run,
 * so a different key a, or a different measurement, rewrites the story.
 */
import { gcd } from './math'
import { derive, type Derived, type LevelId, type Run } from './model'

export interface LevelText {
  title: string
  body: string
  circuit: string
}

export interface Level {
  id: LevelId
  name: string
  gate: string
  /** the gate as it appears on the circuit, drawn in the levels menu (U_f renders f as a subscript) */
  glyph: string
  text: (run: Run, d: Derived) => LevelText
}

const bits = (k: number, width: number) => k.toString(2).padStart(width, '0')
/** The first few of a long list, then an ellipsis. */
const few = (xs: number[], n = 6) => (xs.length > n ? `${xs.slice(0, n).join(', ')}, …` : xs.join(', '))
const approx = (x: number) => (Number.isInteger(x) ? String(x) : `≈ ${x.toFixed(1)}`)

export const LEVELS: Level[] = [
  {
    id: 0,
    name: 'Pick a Key',
    gate: 'classical',
    glyph: 'gcd',
    text: (run, d) => {
      const g = gcd(run.a, run.N)
      return {
        title: 'Choose the lock. Pick any key that fits.',
        body: d.fits
          ? `The lock is the number N = ${run.N}. The key is a guess a. It does not need to be the right key. It only needs to share no factor with N, so it fits the keyway. a = ${run.a} fits.`
          : `The lock is the number N = ${run.N}. The key a = ${run.a} shares the factor ${g} with ${run.N}, so the lock opens by arithmetic alone and no quantum step is needed. Pick a key that shares no factor to see the real thing.`,
        circuit: `gcd(${run.a}, ${run.N}) = ${g}${d.fits ? '  →  the key fits' : '  →  a factor already'}`,
      }
    },
  },
  {
    id: 1,
    name: 'Blank Slate',
    gate: 'initialize',
    glyph: '|0⟩',
    text: (_run, d) => ({
      title: 'A blank key and raised pins.',
      body: `The key has ${2 * d.n} bump positions, all uncut. Inside the lock, ${d.n} pins sit at rest with one raised. Every bump and every pin is a qubit: ${3 * d.n} in total, 3n for n = ${d.n}. Two registers: the key counts, the pins answer.`,
      circuit: `|Ψ₀⟩ = |0⟩⊗${2 * d.n} |1⟩⊗${d.n}`,
    }),
  },
  {
    id: 2,
    name: 'All at Once',
    gate: 'H on the key',
    glyph: 'H',
    text: (_run, d) => ({
      title: 'Cut every bump to every depth at once.',
      body: `A Hadamard gate on each bump makes it cut and uncut at the same time, with exactly equal weight. The key now carries all ${d.Q} possible key codes, each as likely as the next. Nothing is decided, and the lock has not been touched.`,
      circuit: `|Ψ₁⟩ = (1/${Math.sqrt(d.Q)}) Σₓ |x⟩ |1⟩,   x = 0 … ${d.Q - 1}`,
    }),
  },
  {
    id: 3,
    name: 'The Lock Answers',
    gate: 'U_f · insert the key',
    glyph: 'U_f',
    text: (run, d) => ({
      title: 'Insert the key. The pins answer every code at once.',
      body: `Each pin rises to the lock's reply, a^x mod N, for the code the key holds. The key holds every code, so the pins hold every reply, each tied to the code that caused it. That tie is entanglement. The replies cycle through ${d.R} values with a hidden period R.`,
      circuit: `U_f |x⟩|1⟩ = |x⟩ |${run.a}ˣ mod ${run.N}⟩\nreplies ${few(d.rem)}   period R = ${d.R}`,
    }),
  },
  {
    id: 4,
    name: 'Turn the Key',
    gate: 'turn the key',
    glyph: 'QFT†',
    text: (_run, d) => {
      const width = 2 * d.n
      const rows = d.peakKs.map((k) => bits(k, width))
      const open = Array.from({ length: width }, (_, i) => rows.some((r) => r[i] !== rows[0][i])).filter(Boolean).length
      return {
        title: 'Turn the key. Codes that miss the rhythm cancel out.',
        body: `Turning makes the ${d.Q} codes interfere like waves. Codes that do not fit the period push against each other and vanish. Codes that fit reinforce. Only about ${d.R} codes survive, evenly spaced ${approx(d.Q / d.R)} apart. ${width - open} bumps settle. ${open} stay open.`,
        circuit: `IQFT on the key\nsurvivors k = ${few(d.peakKs, 4)}   (spacing ${d.Q}/R ${approx(d.Q / d.R)})`,
      }
    },
  },
  {
    id: 5,
    name: 'Pins Drop',
    gate: 'read pins, then key',
    glyph: 'M',
    text: (run, d) => {
      const k = run.k ?? 0
      const reply = run.dIndex === null ? d.rem[0] : d.rem[run.dIndex]
      return {
        title: 'The pins set. The key freezes into one code.',
        body: `Look at the lock. The pins collapse to one reply, ${reply}. The open bumps settle. Read the code straight off the key: ${bits(k, 2 * d.n)}. That is k = ${k}, one of the ${d.R} survivors, each equally likely.`,
        circuit: `measure second register → d = ${reply}\nmeasure first register → k = ${k}   (probability 1/${d.R})`,
      }
    },
  },
  {
    id: 6,
    name: 'Crack the Lock',
    gate: 'classical',
    glyph: 'CF',
    text: (run, d) => {
      const o = d.outcome
      const k = run.k ?? 0
      if (!o || o.kind === 'no-info')
        return {
          title: 'k = 0 says nothing. Measure again.',
          body: `The dial landed on the zero click. 0 over ${d.Q} has no denominator to read. This happens about 1 time in ${d.R}. Go back a step and measure again.`,
          circuit: `0/${d.Q}  →  no period`,
        }
      if (o.kind === 'wrong-period')
        return {
          title: 'A false set. The pins felt right, but the key will not turn.',
          body: `k = ${k} reduces to a fraction with denominator ${o.guess}, but ${run.a}^${o.guess} mod ${run.N} = ${o.check}, not 1. So ${o.guess} is not the period, only a divisor of it. This is Shor's false pin. Measure again.`,
          circuit: `${k}/${d.Q} → denominator ${o.guess}\n${run.a}^${o.guess} mod ${run.N} = ${o.check} ≠ 1`,
        }
      if (o.kind === 'odd-period')
        return {
          title: 'The period is odd. This key cannot split N.',
          body: `R = ${o.R} is odd, so a^(R/2) is not a whole number. Shor's algorithm needs an even period. Pick another key at level 0.`,
          circuit: `R = ${o.R}  (odd)`,
        }
      if (o.kind === 'trivial-root')
        return {
          title: 'The period is real, but this key cannot split N.',
          body: `R = ${o.R}, and ${run.a}^(R/2) mod ${run.N} = ${o.root}, which is N − 1. Then gcd(root ± 1, N) gives only 1 and N. Pick another key at level 0.`,
          circuit: `${run.a}^${o.R / 2} mod ${run.N} = ${o.root} = N − 1`,
        }
      const g = gcd(k, d.Q)
      return {
        title: 'From one code to the period, then to the factors.',
        body: `k over ${d.Q} is ${k}/${d.Q}, which reduces to ${k / g}/${d.Q / g}. The denominator is the period, R = ${o.R}. Then ${run.a}^(R/2) mod ${run.N} = ${o.root}, and gcd(${o.root} ± 1, ${run.N}) gives ${o.p} and ${o.q}. The shackle pops. ${run.N} = ${o.p} × ${o.q}.`,
        circuit: `${k}/${d.Q} = ${k / g}/${d.Q / g}  →  R = ${o.R}\n${run.a}^${o.R / 2} mod ${run.N} = ${o.root}\ngcd(${o.root - 1}, ${run.N}) = ${o.p}   gcd(${o.root + 1}, ${run.N}) = ${o.q}`,
      }
    },
  },
]

export const levelText = (level: LevelId, run: Run): LevelText => LEVELS[level].text(run, derive(run))

/** Course number like a Mario level: world 1 is one N, so level 3 is "1-4". */
export const courseOf = (level: number) => `1-${level + 1}`
