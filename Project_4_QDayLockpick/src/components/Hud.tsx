import type { ReactNode, Ref } from 'react'
import { LEVELS, courseOf } from '../shor/levels'
import type { Derived, LevelId, Run } from '../shor/model'
import type { Step } from '../shor/challenges'
import { Readout } from './Readout'

/**
 * The one place on screen for menus and information, always bottom centre.
 * A header line, an optional body, and the next move underneath.
 */
export function Panel({ head, children, actions, ref }: { head: ReactNode; children?: ReactNode; actions: ReactNode; ref?: Ref<HTMLElement> }) {
  return (
    <aside className="hud" ref={ref}>
      {head && <header className="hud-head">{head}</header>}
      {children}
      <div className="hud-actions">{actions}</div>
    </aside>
  )
}

interface LevelProps {
  level: LevelId
  run: Run
  d: Derived
  showInfo: boolean
  onToggleInfo: () => void
  onMap: () => void
  primary: string
  canContinue: boolean
  onContinue: () => void
  onMeasureAgain: () => void
  onPickKey: (a: number) => void
  steps: Step[]
  step: number
  /** wrong answers on the current question; one or more shows its hint */
  miss: number
  solved: boolean
  onAct: () => void
  onAnswer: (option: string) => void
  tries: number
  maxTries: number
  onFactorTry: (x: number) => void
  ref?: Ref<HTMLElement>
}


/**
 * A level's controls. The bar along the bottom is always the same: Menu, Info, then this level's own actions
 * and the next move. The instructions are a card at the top left, next to the lock, not in the bar.
 */
/** One short line under the level name: what this step is for, not the answer. */
const SUB: Record<LevelId, string> = {
  0: 'Try to split 851 by hand. Then pick the key a for the quantum part.',
  1: 'Count the qubits this lock needs.',
  2: 'Put the key into superposition.',
  3: 'Let the lock answer every code at once.',
  4: 'Turn the key: codes out of rhythm cancel.',
  5: 'Measure: one code survives.',
  6: 'Turn that one code into the factors.',
}

export function LevelHud(props: LevelProps) {
  const { level, run, d, primary, canContinue, onContinue, onMeasureAgain, onPickKey } = props
  const { steps, step, miss, solved, onAct, onAnswer, tries, maxTries, onFactorTry, ref } = props
  const cur = solved ? null : steps[step]
  const goal = level === 0 ? `Find a factor of ${run.N} yourself: ${maxTries} tries.` : cur?.goal
  return (
    <>
      <header className="level-tag">
        <div>
          <span>{courseOf(level)}</span> {LEVELS[level].name}
        </div>
        <p>{SUB[level]}</p>
      </header>
      <aside className="hud bar" ref={ref}>
        {goal && !(level === 0 && solved) && (
          <p className="bar-goal">
            {steps.length > 1 && !solved && <span className="bar-step">{step + 1}/{steps.length}</span>}
            {goal}
          </p>
        )}
        {miss > 0 && cur?.kind === 'ask' && (
          <p className="bar-miss" key={miss} role="status">
            Not quite. {cur.hint}
          </p>
        )}
        {level === 0 && tries > 0 && !solved && (
          <p className="bar-miss" key={tries} role="status">
            Not a factor.
          </p>
        )}
        {level === 0 && <Readout level={0} run={run} d={d} onPickKey={onPickKey} />}
        {level === 0 && (
          <div className="bar-row factor-try">
            <button type="button" className="go-btn bar-go" onClick={() => onFactorTry(run.a)} disabled={solved}>
              Try a = {run.a}
            </button>
            <span className="tries">{maxTries - tries} left</span>
          </div>
        )}
        {cur?.kind === 'ask' && (
          <div className="bar-row bar-options" role="group" aria-label="Your answer">
            {cur.options.map((o) => (
              <button key={o} type="button" className="bar-btn opt" onClick={() => onAnswer(o)}>
                {o}
              </button>
            ))}
          </div>
        )}
        <div className="bar-row">
          {level === 5 && solved && (
            <button type="button" className="bar-btn" onClick={onMeasureAgain}>
              Re-measure
            </button>
          )}
          {level === 0 ? null : cur?.kind === 'act' ? (
            <button type="button" className="go-btn bar-go" onClick={onAct}>
              {cur.label} ▶
            </button>
          ) : primary.startsWith('Continue') ? (
            <button type="button" className="go-btn bar-go plus" onClick={onContinue} disabled={!canContinue} aria-label={primary} title={primary}>
              <svg viewBox="0 0 20 20" width="26" height="26" aria-hidden="true">
                <path d="M6 3 L17 10 L6 17 Z" fill="currentColor" />
              </svg>
            </button>
          ) : (
            <button type="button" className="go-btn bar-go" onClick={onContinue} disabled={!canContinue}>
              {primary}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
