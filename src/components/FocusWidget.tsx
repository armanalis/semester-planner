import clsx from 'clsx'
import { Minus, Pause, Play, Plus, RotateCcw, Settings2, SkipForward, Square, Timer } from 'lucide-react'
import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { MAX_MINUTES, useFocus, timeLeft, type Phase } from '../lib/focus'
import { hueVars } from '../lib/hues'
import { useT } from '../lib/i18n'
import { usePlanner } from '../store'
import { Segmented } from './ui'

const mmss = (msLeft: number) => {
  const total = Math.ceil(msLeft / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Keeps the timer moving, finishes phases on time and shows the time in the tab title. */
function useTicker() {
  const status = useFocus((s) => s.status)
  const [, force] = useState(0)
  useEffect(() => {
    useFocus.getState().tick() // catch up if a phase ended while the tab was closed
    if (status !== 'running') return
    const id = setInterval(() => {
      useFocus.getState().tick()
      force((n) => n + 1)
    }, 500)
    return () => clearInterval(id)
  }, [status])
}

export function FocusWidget() {
  useTicker()
  const T = useT()
  const { t } = T
  const focus = useFocus()
  const courses = usePlanner((s) => s.courses)
  const toggleDone = usePlanner((s) => s.toggleDone)
  const done = usePlanner((s) => s.done)
  const [showSettings, setShowSettings] = useState(false)

  const left = timeLeft(focus)
  const course = courses.find((c) => c.id === focus.courseId)
  const phaseLabel = { focus: t('phaseFocus'), short: t('phaseShort'), long: t('phaseLong') }[focus.phase]

  useEffect(() => {
    const base = 'Semester planner'
    document.title = focus.status === 'running' ? `${mmss(left)} · ${phaseLabel}` : base
    return () => {
      document.title = base
    }
  }, [left, phaseLabel, focus.status])

  // collapsed: a small pill while a timer is going, nothing otherwise
  if (!focus.open) {
    if (focus.status === 'idle' && !focus.finishedBlock) return null
    return (
      <button
        onClick={() => focus.setOpen(true)}
        style={course ? hueVars(course.hue) : undefined}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border border-rule-strong bg-sheet py-2 pr-4 pl-3 font-bold shadow-[0_10px_30px_-12px_rgb(10_15_30/0.45)]"
      >
        <Timer size={17} className={course ? 'text-[var(--ink)]' : 'text-pen'} />
        <span className="tabular-nums">{mmss(left)}</span>
        <span className="text-sm font-semibold text-ink-soft">{phaseLabel}</span>
        {focus.status === 'paused' && <Pause size={14} className="text-ink-faint" />}
      </button>
    )
  }

  const pct = focus.duration ? 1 - left / focus.duration : 0
  const elapsedMin = (focus.duration - left) / 60_000
  const finished = focus.finishedBlock
  const finishedDone = finished && done[`${finished.blockId}|${finished.week}`]

  return (
    <section
      aria-label={t('focusTimer')}
      style={course ? hueVars(course.hue) : undefined}
      className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-rule-strong bg-sheet p-4 shadow-[0_24px_60px_-20px_rgb(10_15_30/0.5)] sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[22rem]"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold">
          <Timer size={18} className="text-pen" /> {showSettings ? t('timerSettings') : t('focusTimer')}
        </h2>
        <div className="flex">
          <button
            className={clsx('btn btn-quiet p-1.5', showSettings && 'bg-pen-soft text-pen')}
            onClick={() => setShowSettings((v) => !v)}
            aria-label={t('timerSettings')}
            aria-pressed={showSettings}
          >
            <Settings2 size={17} />
          </button>
          <button className="btn btn-quiet p-1.5" onClick={() => focus.setOpen(false)} aria-label={t('minimize')}>
            <Minus size={17} />
          </button>
        </div>
      </div>

      {showSettings ? (
        <TimerSettings onBack={() => setShowSettings(false)} />
      ) : (
        <>
          <Segmented<Phase>
            label={t('focusTimer')}
            value={focus.phase}
            onChange={(p) => focus.setPhase(p)}
            options={[
              { value: 'focus', label: t('phaseFocus') },
              { value: 'short', label: t('phaseShort') },
              { value: 'long', label: t('phaseLong') },
            ]}
          />

          <div className="my-4 text-center">
            <Clock left={left} />
            <div className="mx-auto mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-rule">
              <div
                className="h-full rounded-full bg-[var(--ink,var(--color-pen))] transition-[width] duration-500"
                style={{ width: `${Math.round(pct * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              {t('round', { n: Math.min(focus.round + (focus.phase === 'focus' ? 1 : 0), focus.settings.rounds) || 1, total: focus.settings.rounds })}
            </p>
          </div>

          {focus.phase === 'focus' && (
            <div className="mb-3 grid grid-cols-[8rem_1fr] gap-2">
              <select
                className="field py-1.5"
                value={focus.courseId}
                onChange={(e) => focus.setTarget({ courseId: e.target.value, blockId: '' })}
                aria-label={T.t('course')}
              >
                <option value="">{t('noCourse')}</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.short}
                  </option>
                ))}
              </select>
              <input
                className="field py-1.5"
                placeholder={t('workingOn')}
                value={focus.label}
                onChange={(e) => focus.setTarget({ label: e.target.value, blockId: focus.blockId })}
                aria-label={t('workingOn')}
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            {focus.status === 'running' ? (
              <button className="btn btn-primary flex-1 justify-center" onClick={focus.pause}>
                <Pause size={16} /> {t('pause')}
              </button>
            ) : (
              <button className="btn btn-primary flex-1 justify-center" onClick={focus.start}>
                <Play size={16} /> {focus.status === 'paused' ? t('resume') : t('start')}
              </button>
            )}
            <button className="btn btn-quiet p-2" onClick={focus.reset} aria-label={t('reset')} title={t('reset')}>
              <RotateCcw size={17} />
            </button>
            <button className="btn btn-quiet p-2" onClick={focus.skip} aria-label={t('skipPhase')} title={t('skipPhase')}>
              <SkipForward size={17} />
            </button>
            {focus.phase === 'focus' && focus.status !== 'idle' && elapsedMin >= 1 && (
              <button className="btn btn-quiet p-2" onClick={focus.stopAndSave} aria-label={t('stopSave')} title={t('stopSave')}>
                <Square size={16} />
              </button>
            )}
          </div>

          {finished && !finishedDone && (
            <div className="mt-3 rounded-xl bg-pen-soft p-3 text-sm" role="status">
              <p>{t('focusDone', { title: finished.label || T.t('studyBlocks') })}</p>
              <div className="mt-2 flex gap-2">
                <button
                  className="btn btn-primary py-1"
                  onClick={() => {
                    toggleDone(finished.blockId, finished.week)
                    focus.clearFinished()
                  }}
                >
                  {t('markDoneShort')}
                </button>
                <button className="btn btn-quiet py-1" onClick={focus.clearFinished}>
                  {t('notYet')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** The big time. While the timer waits, −/+ nudge the length by a minute and tapping it lets you type one. */
function Clock({ left }: { left: number }) {
  const { t } = useT()
  const phase = useFocus((s) => s.phase)
  const status = useFocus((s) => s.status)
  const minutes = useFocus((s) => s.settings[s.phase])
  const setSettings = useFocus((s) => s.setSettings)
  const [editing, setEditing] = useState(false)
  const max = MAX_MINUTES[phase]
  const setMinutes = (v: number) => setSettings({ [phase]: Math.min(max, Math.max(1, Math.round(v))) })
  const big = 'text-6xl leading-none font-bold tracking-tight tabular-nums'

  if (status !== 'idle') {
    return (
      <p className={big} aria-live="off">
        {mmss(left)}
      </p>
    )
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <button className="btn btn-quiet p-2" onClick={() => setMinutes(minutes - 1)} disabled={minutes <= 1} aria-label={t('removeMinute')}>
        <Minus size={18} />
      </button>
      {editing ? (
        <NumberInput
          autoFocus
          value={minutes}
          max={max}
          onSave={setMinutes}
          onDone={() => setEditing(false)}
          aria-label={t(`${phase}Minutes`)}
          className={clsx(big, 'field w-[3.5ch] px-1 py-0 text-center placeholder:text-ink-faint')}
        />
      ) : (
        <button className={clsx(big, 'rounded-lg px-1 hover:bg-pen-soft')} onClick={() => setEditing(true)} title={t('typeMinutes')}>
          {mmss(left)}
        </button>
      )}
      <button className="btn btn-quiet p-2" onClick={() => setMinutes(minutes + 1)} disabled={minutes >= max} aria-label={t('addMinute')}>
        <Plus size={18} />
      </button>
    </div>
  )
}

function TimerSettings({ onBack }: { onBack: () => void }) {
  const { t } = useT()
  const settings = useFocus((s) => s.settings)
  const status = useFocus((s) => s.status)
  const setSettings = useFocus((s) => s.setSettings)

  const num = (key: 'focus' | 'short' | 'long' | 'rounds', label: string, max: number) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-soft">{label}</span>
      <NumberInput
        value={settings[key]}
        max={max}
        onSave={(v) => setSettings({ [key]: v })}
        className="field w-20 py-1 text-right tabular-nums placeholder:text-ink-faint"
      />
    </label>
  )

  const check = (key: 'autoStart' | 'sound', label: string) => (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span className="text-ink-soft">{label}</span>
      <input
        type="checkbox"
        checked={settings[key]}
        onChange={(e) => setSettings({ [key]: e.target.checked })}
        className="size-4 accent-[var(--color-pen)]"
      />
    </label>
  )

  return (
    <div className="space-y-2.5">
      {num('focus', t('focusMinutes'), MAX_MINUTES.focus)}
      {num('short', t('shortMinutes'), MAX_MINUTES.short)}
      {num('long', t('longMinutes'), MAX_MINUTES.long)}
      {num('rounds', t('roundsLabel'), 12)}
      {check('autoStart', t('autoStart'))}
      {check('sound', t('soundOn'))}
      {status !== 'idle' && <p className="text-xs text-ink-soft">{t('appliesNext')}</p>}
      <div className="flex justify-end pt-1">
        <button className="btn btn-primary" onClick={onBack}>
          {t('done')}
        </button>
      </div>
    </div>
  )
}

/**
 * A whole-number box. Tapping it empties it (the current number stays as a faint hint), so typing never
 * mixes with the old digits. Enter or leaving the box saves, kept within 1…max; Esc keeps the old number.
 */
function NumberInput({
  value,
  max,
  onSave,
  onDone,
  ...props
}: {
  value: number
  max: number
  onSave: (v: number) => void
  onDone?: () => void
} & Pick<InputHTMLAttributes<HTMLInputElement>, 'autoFocus' | 'aria-label' | 'className'>) {
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)
  return (
    <input
      {...props}
      inputMode="numeric"
      value={draft ?? value}
      placeholder={String(value)}
      onFocus={() => setDraft('')}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 3))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
      onBlur={() => {
        if (draft && !cancelled.current) onSave(Math.min(max, Math.max(1, Number(draft))))
        cancelled.current = false
        setDraft(null)
        onDone?.()
      }}
    />
  )
}
