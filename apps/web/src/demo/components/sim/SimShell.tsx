'use client'
import { useEffect, type ReactNode } from 'react'
import { LIFECYCLE } from '@/demo/lib/fixtures'
import { chipTone } from '../OrderLine'

export type StepDef = { title: string; blurb: string }

export function Chip({ status }: { status: string }) {
  return (
    <span className={`chip chip-${chipTone(status)}`} key={status}>
      {status}
    </span>
  )
}

/** Real lifecycle rail. `index` = current status index, or -1 for none yet. */
export function Lifecycle({ index }: { index: number }) {
  return (
    <ol className="lifecycle" aria-label="Order status">
      {LIFECYCLE.map((s, i) => (
        <li
          key={s}
          data-state={i < index ? 'done' : i === index ? 'now' : 'todo'}
          aria-current={i === index ? 'step' : undefined}
        >
          <span className="lc-dot" />
          <span className="lc-label">{s}</span>
        </li>
      ))}
    </ol>
  )
}

export function SimShell({
  id,
  title,
  tag,
  steps,
  step,
  maxStep,
  onStep,
  canNext,
  nextLabel,
  onFinish,
  children,
  lifecycleIndex,
}: {
  id: string
  title: string
  tag: string
  steps: StepDef[]
  step: number
  maxStep: number
  onStep: (n: number) => void
  canNext: boolean
  nextLabel?: string
  onFinish?: () => void
  children: ReactNode
  lifecycleIndex: number
}) {
  const last = step === steps.length - 1
  useEffect(() => {
    // keep the active step visible in the horizontal mobile strip
    document
      .querySelector(`#${id} [data-active="true"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [id, step])
  return (
    <div className="sim" id={id}>
      <nav className="sim-steps" aria-label="Walkthrough steps">
        <ol>
          {steps.map((s, i) => (
            <li key={s.title} data-state={i < step ? 'done' : i === step ? 'now' : 'todo'}>
              <button
                type="button"
                data-active={i === step}
                disabled={i > maxStep}
                onClick={() => onStep(i)}
                aria-current={i === step ? 'step' : undefined}
              >
                <span className="sn">{i + 1}</span>
                <span className="st">
                  <b>{s.title}</b>
                  <small>{s.blurb}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="sim-stage">
        <header className="sim-top">
          <div>
            <p className="eyebrow">{title}</p>
            <p className="sim-stepname" aria-live="polite">
              Step {step + 1} of {steps.length}: {steps[step].title}
            </p>
          </div>
          <span className="sample-tag">{tag}</span>
        </header>
        <div className="sim-progress" aria-hidden="true">
          <span style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
        <Lifecycle index={lifecycleIndex} />
        <div className="sim-pane" key={step}>
          {children}
        </div>
        <footer className="sim-nav">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => onStep(step - 1)}
            disabled={step === 0}
          >
            Back
          </button>
          {!canNext && !last && (
            <span className="sim-hint">Complete the action above to continue</span>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canNext && !last}
            onClick={() => (last ? onFinish?.() : onStep(step + 1))}
          >
            {last ? (nextLabel ?? 'Request a personal demo') : 'Next'}
          </button>
        </footer>
      </div>
    </div>
  )
}
