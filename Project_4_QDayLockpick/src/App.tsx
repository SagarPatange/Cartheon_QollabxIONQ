import gsap from 'gsap'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LevelHud, Panel } from './components/Hud'
import { LockStage } from './components/LockStage'
import { WorldMap } from './components/WorldMap'
import { KeyShape } from './components/Key'
import { LEVELS } from './shor/levels'
import { stepsFor } from './shor/challenges'
import { gcd } from './shor/math'
import { LEVEL_IDS, derive, lockState, measure, newRun, type LevelId, type Run } from './shor/model'

/** big enough that nobody factors it in their head, small enough (n = 10, Q = 2^20) to simulate exactly */
const N = 851
const DEFAULT_KEY = 7
const LAST = LEVEL_IDS.length - 1
const CLEAR_MS = 900
const WORLD_CLEAR_MS = 1600

type Screen = 'title' | 'map' | 'level'

/**
 * No query opens the title screen, `?map` the world map. `?level=4&a=7` opens a level directly, `?level=6&a=7&k=192&d=2` reproduces a
 * measurement. Opening a level unlocks every level before it.
 */
function initialFromUrl(): { screen: Screen; level: LevelId; run: Run } {
  const p = new URLSearchParams(location.search)
  const raw = p.get('level')
  const lvl = Number(raw)
  const has = raw !== null && (LEVEL_IDS as readonly number[]).includes(lvl)
  const level = has ? (lvl as LevelId) : 0
  const a = Number(p.get('a')) || DEFAULT_KEY
  let run = newRun(N, a)
  if (level >= 5) {
    const k = p.get('k')
    const dIdx = p.get('d')
    run = k !== null ? { ...run, k: Number(k), dIndex: Number(dIdx ?? 0) } : measure(run)
  }
  return { screen: has ? 'level' : p.has('map') ? 'map' : 'title', level, run }
}

const SAVE = 'shors-key-progress'
interface Saved {
  level: LevelId
  reached: number
  cleared: boolean
  run: Run
}
/** Progress survives a reload (and the dev server's hot reloads), so nobody restarts from 1-1. */
function loadSaved(): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE) ?? 'null') as Saved | null
    return s && s.run?.N === N ? s : null
  } catch {
    return null
  }
}

export default function App() {
  const [initial] = useState(() => {
    const fromUrl = initialFromUrl()
    const saved = location.search ? null : loadSaved()
    return saved ? { ...fromUrl, screen: 'map' as Screen, level: saved.level, run: saved.run, reached: saved.reached, cleared: saved.cleared } : { ...fromUrl, reached: fromUrl.level, cleared: false }
  })
  const [screen, setScreen] = useState<Screen>(initial.screen)
  /** the level being played, or the stop selected on the map */
  const [level, setLevel] = useState<LevelId>(initial.level)
  const [run, setRun] = useState<Run>(initial.run)
  /** highest level unlocked */
  const [reached, setReached] = useState<number>(initial.reached)
  const [cleared, setCleared] = useState(initial.cleared)
  const [banner, setBanner] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [enterOnArrive, setEnterOnArrive] = useState<LevelId | null>(null)
  const [launching, setLaunching] = useState<LevelId | null>(null)
  const hudRef = useRef<HTMLElement>(null)
  const titleKey = useRef<HTMLDivElement>(null)
  /** false only for the first screen of a deep link; every screen reached by playing has the key fly in */
  const [animateIn, setAnimateIn] = useState(false)
  /** the level screen's exit: set while its key flies out to the centre, then runs */
  const [leaving, setLeaving] = useState<(() => void) | null>(null)
  const goScreen = useCallback((s: Screen) => {
    setAnimateIn(true)
    setScreen(s)
  }, [])
  /** Leave the level: the key lifts to the centre first, the map then catches it there. */
  const leaveLevel = useCallback((then: () => void) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) then()
    else setLeaving(() => then)
  }, [])
  /** Leave the title: the key grows to the centre while the title fades, the map then catches it there. */
  const start = useCallback(() => {
    const el = titleKey.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return goScreen('map')
    const r = el.getBoundingClientRect()
    gsap
      .timeline({ onComplete: () => goScreen('map') })
      .to('.title, .title-screen .hud', { opacity: 0, duration: 0.25 })
      .to(el, { x: innerWidth / 2 - (r.left + r.width / 2), y: innerHeight / 2 - (r.top + r.height / 2), scale: 2.2, duration: 0.5, ease: 'power2.inOut' }, 0)
  }, [goScreen])

  const d = useMemo(() => derive(run), [run])
  // each level is a challenge: act, then predict. The explanation and Continue wait until it is solved.
  const steps = useMemo(() => stepsFor(level, run, d), [level, run, d])
  const [step, setStep] = useState(0)
  const [miss, setMiss] = useState(0)
  const [picked, setPicked] = useState(false)
  /** 1-1 opens with a try at factoring N by hand: three misses (or a hit) clear the course */
  const [tries, setTries] = useState(0)
  const [autoClear, setAutoClear] = useState<string | null>(null)
  /** 1-1: Continue makes the key try the keyway and fail before the course clears */
  const [tryInsert, setTryInsert] = useState(0)
  const MAX_TRIES = 3
  const factorTry = useCallback(
    (x: number) => {
      if (autoClear) return
      // every try pushes the key at the keyway; it rattles whether or not the number is right
      setTryInsert((n) => n + 1)
      const hit = x > 1 && x < N && N % x === 0
      const t = tries + 1
      setTries(t)
      if (hit || t >= MAX_TRIES) {
        // the quantum levels need a key that shares no factor with N; a factor guess is not one
        if (gcd(run.a, N) !== 1) setRun(newRun(N, DEFAULT_KEY))
        setPicked(true)
        setAutoClear(hit ? 'Did you cheat?' : 'Very hard to do!')
      }
    },
    [tries, autoClear, run.a],
  )
  const solved = level === 0 ? picked : step >= steps.length
  // until the level's action is taken, the lock still shows the previous step
  const shown: LevelId = level > 0 && steps[0]?.kind === 'act' && step === 0 ? ((level - 1) as LevelId) : level
  // the shackle pops when you press "Open the lock", not before
  const state = useMemo(() => {
    const s = lockState(shown, run)
    return { ...s, shackleOpen: s.shackleOpen && cleared }
  }, [shown, run, cleared])
  const factors: [number, number] | null = d.outcome?.kind === 'factored' ? [d.outcome.p, d.outcome.q] : null

  const verdict = useMemo(() => {
    if (level !== 6 || !d.outcome) return null
    const o = d.outcome
    if (o.kind === 'factored') return { text: `${N} = ${o.p} × ${o.q}`, ok: true }
    if (o.kind === 'wrong-period') return { text: 'False set: measure again', ok: false }
    if (o.kind === 'no-info') return { text: 'k = 0 tells nothing: measure again', ok: false }
    return { text: 'This key cannot split N: pick another', ok: false }
  }, [level, d.outcome])

  /** Enter a level. The quantum levels need a key that fits; measuring happens the first time level 5 opens. */
  const enter = useCallback(
    (l: LevelId) => {
      setLaunching(null)
      if (l > reached || (l > 0 && !d.fits)) return
      if (l >= 5 && run.k === null) setRun((r) => measure(r))
      setLevel(l)
      goScreen('level')
    },
    [reached, d.fits, run.k, goScreen],
  )
  /** From the map the key flies into the level first (WorldMap calls enter when it lands); elsewhere go straight in. */
  const play = useCallback(
    (l: LevelId) => {
      if (l > reached || (l > 0 && !d.fits)) return
      if (screen === 'map') setLaunching((cur) => cur ?? l)
      else enter(l)
    },
    [screen, reached, d.fits, enter],
  )

  const toMap = useCallback(() => {
    leaveLevel(() => {
      goScreen('map')
      setBanner(null)
    })
  }, [leaveLevel, goScreen])

  const newKey = useCallback((a: number) => {
    setRun(newRun(N, a))
    setReached(0)
    setCleared(false)
  }, [])

  const measureAgain = useCallback(() => {
    setRun((r) => measure(r))
    setLevel(5)
    setShowInfo(true)
  }, [])

  /** Finish the level: course clear, back to the map, and the key walks to the next stop. */
  const clear = useCallback((msg?: string) => {
    if (!d.fits || banner || !solved) return
    if (level < LAST) {
      const next = (level + 1) as LevelId
      setReached((r) => Math.max(r, next))
      setBanner(msg ?? 'Course clear')
      setTimeout(() => {
        setBanner(null)
        leaveLevel(() => {
          goScreen('map')
          setLevel(next)
        })
      }, CLEAR_MS)
      return
    }
    const o = d.outcome
    if (o?.kind === 'factored') {
      setCleared(true)
      setBanner('World clear')
      setTimeout(() => {
        setBanner(null)
        leaveLevel(() => goScreen('map'))
      }, WORLD_CLEAR_MS)
    } else if (o?.kind === 'no-info' || o?.kind === 'wrong-period') {
      // stay on 1-7: run the circuit again and read the new code here
      setRun((r) => measure(r))
    } else {
      // this key can never split N: back to the start of the world for a new one
      leaveLevel(() => {
        newKey(run.a)
        goScreen('map')
        setLevel(0)
      })
    }
  }, [d.fits, d.outcome, banner, solved, level, measureAgain, newKey, run.a, leaveLevel, goScreen])

  /** Continue. 1-1 has no Continue: it clears through the factoring tries. */
  const proceed = useCallback(
    (msg?: string) => {
      if (level !== 0) clear(msg)
    },
    [level, clear],
  )

  useEffect(() => {
    if (!autoClear || !solved) return
    const t = setTimeout(() => {
      clear(autoClear)
      setAutoClear(null)
      setTries(0)
    }, 1300)
    return () => clearTimeout(t)
  }, [autoClear, solved, clear])

  /** Map click: walk there, then go in. Clicking the stop the key already stands on goes straight in. */
  const pickStop = useCallback(
    (l: LevelId) => {
      if (launching !== null) return
      if (l === level) return play(l)
      setLevel(l)
      setEnterOnArrive(l)
    },
    [level, launching, play],
  )
  const arrived = useCallback(
    (l: LevelId) => {
      if (enterOnArrive === l) {
        setEnterOnArrive(null)
        play(l)
      }
    },
    [enterOnArrive, play],
  )

  // instructions open on each new level; clicking anywhere outside the panel hides them, i brings them back
  const challengeId = `${screen}-${level}-${level === 0 ? '' : run.a}-${run.k}`
  const [infoFor, setInfoFor] = useState(challengeId)
  if (infoFor !== challengeId) {
    setInfoFor(challengeId)
    setStep(0)
    setMiss(0)
    setShowInfo(false)
  }
  const advance = useCallback(() => {
    setMiss(0)
    setStep((s) => {
      if (s + 1 >= steps.length) setShowInfo(true)
      return s + 1
    })
  }, [steps.length])
  const answer = useCallback(
    (opt: string) => {
      const cur = steps[step]
      if (cur?.kind !== 'ask') return
      if (opt === cur.answer) advance()
      else setMiss((m) => m + 1)
    },
    [steps, step, advance],
  )
  useEffect(() => {
    if (!showInfo || screen !== 'level') return
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const t = e.target as Element | null
      if (hudRef.current?.contains(t) || t?.closest?.('.info-card, #qday-review')) return
      setShowInfo(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [showInfo, screen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as Element | null
      if (t?.closest?.('textarea, input, #qday-review')) return
      const onButton = !!t?.closest?.('button, [role="button"]')
      if (screen === 'title') {
        if ((e.key === 'Enter' || e.key === ' ') && !onButton) start()
        return
      }
      if (screen === 'map') {
        if (launching !== null) return
        if (e.key === 'ArrowRight' && level < Math.min(reached, LAST)) setLevel((level + 1) as LevelId)
        if (e.key === 'ArrowLeft' && level > 0) setLevel((level - 1) as LevelId)
        if ((e.key === 'Enter' || e.key === ' ') && !onButton) {
          e.preventDefault()
          play(level)
        }
        return
      }
      if (e.key === 'Escape') {
        if (showInfo) setShowInfo(false)
        else toMap()
      }
      if (e.key === 'ArrowRight' || (e.key === 'Enter' && !onButton)) proceed()
      if (e.key === 'ArrowLeft' && level > 0) play((level - 1) as LevelId)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [screen, level, reached, showInfo, launching, play, proceed, toMap, start])

  useEffect(() => {
    try {
      localStorage.setItem(SAVE, JSON.stringify({ level, reached, cleared, run } satisfies Saved))
    } catch {
      // private mode or blocked storage: progress just will not survive a reload
    }
  }, [level, reached, cleared, run])

  // dev only: the Alt+right-click review note records where you were
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __qdayState?: unknown }).__qdayState = { screen, level, run }
  }, [screen, level, run])

  if (screen === 'title') {
    return (
      <main className="screen title-screen">
        <div className="title-art" aria-hidden="true" ref={titleKey}>
          <svg viewBox="-24 -80 48 84">
            <KeyShape />
          </svg>
        </div>
        <h1 className="title">Shor's Key</h1>
        <Panel
          head={null}
          actions={
            <button type="button" className="go-btn" onClick={start} autoFocus>
              Start ▶
            </button>
          }
        />
      </main>
    )
  }

  if (screen === 'map') {
    return (
      <main className="screen scene">
        <WorldMap at={level} reached={reached} cleared={cleared} N={N} factors={factors} onPick={pickStop} onArrive={arrived} launching={launching} onLaunched={enter} animateIn={animateIn} />
        <button
          type="button"
          className={`go-btn big-play${launching !== null ? ' gone' : ''}`}
          onClick={() => (cleared ? newKey(run.a) : play(level))}
          disabled={launching !== null || (!cleared && level > reached)}
          aria-label={cleared ? 'Play again' : `Play ${LEVELS[level].name}`}
        >
          {cleared ? 'Play again' : 'Play ▶'}
        </button>
      </main>
    )
  }

  const o = d.outcome
  const primary =
    level < LAST
      ? 'Continue ▶'
      : o?.kind === 'factored'
        ? 'Open the lock ▶'
        : o?.kind === 'no-info' || o?.kind === 'wrong-period'
          ? 'Measure again'
          : 'New key'

  return (
    <main className="screen scene">
      <LockStage
        state={state}
        N={run.N}
        a={run.a}
        verdict={verdict}
        tryInsert={tryInsert}
        leaving={leaving !== null}
        onLeft={() => {
          const then = leaving
          setLeaving(null)
          then?.()
        }}
      />
      <LevelHud
        ref={hudRef}
        level={level}
        run={run}
        d={d}
        showInfo={showInfo}
        onToggleInfo={() => setShowInfo((v) => !v)}
        onMap={toMap}
        primary={primary}
        canContinue={d.fits && !banner && solved}
        onContinue={() => proceed()}
        tries={tries}
        maxTries={MAX_TRIES}
        onFactorTry={factorTry}
        onMeasureAgain={measureAgain}
        onPickKey={newKey}
        steps={steps}
        step={step}
        miss={miss}
        solved={solved}
        onAct={advance}
        onAnswer={answer}
      />
      {banner && (
        <div className={`banner${banner === 'World clear' ? ' win' : ''}`} role="status">
          <span>{banner}</span>
        </div>
      )}
    </main>
  )
}
