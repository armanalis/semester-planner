import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { Timer, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { hueVars } from '../lib/hues'
import { useFocus } from '../lib/focus'
import { useT } from '../lib/i18n'
import { TIME_OPTIONS, hm } from '../lib/time'
import { usePlanner } from '../store'
import type { StudyBlock } from '../types'
import { Dialog, Label, Segmented, Tick } from './ui'

export type BlockDraft = Omit<StudyBlock, 'id' | 'week'> & { id?: string; week?: string }

export function BlockDialog({ draft, week, onClose }: { draft: BlockDraft | null; week: string; onClose: () => void }) {
  const { t } = useT()
  return (
    <Dialog open={draft !== null} onClose={onClose} title={t(draft?.id ? 'editBlock' : 'planBlock')} wide>
      {draft && <BlockForm draft={draft} week={week} onClose={onClose} />}
    </Dialog>
  )
}

function BlockForm({ draft, week, onClose }: { draft: BlockDraft; week: string; onClose: () => void }) {
  const { t, fmt, daysLong } = useT()
  const courses = usePlanner((s) => s.courses)
  const tasks = usePlanner((s) => s.tasks)
  const done = usePlanner((s) => s.done)
  const { addBlock, updateBlock, removeBlock, toggleDone } = usePlanner.getState()
  const [form, setForm] = useState(draft)
  const set = <K extends keyof BlockDraft>(k: K, v: BlockDraft[K]) => setForm((f) => ({ ...f, [k]: v }))

  const course = courses.find((c) => c.id === form.courseId)
  const suggestions = tasks.filter((x) => x.courseId === form.courseId && !x.done && x.title !== form.title).slice(0, 4)
  const isDone = !!(form.id && done[`${form.id}|${week}`])

  const save = (e: FormEvent) => {
    e.preventDefault()
    const title = form.title.trim() || t('defaultTitle', { short: course?.short ?? '' }).trim()
    const end = form.end > form.start ? form.end : form.start + 60
    const base = { courseId: form.courseId, day: form.day, start: form.start, end, title, repeat: form.repeat }
    if (form.id) {
      const weekField = form.repeat === 'once' && draft.repeat === 'weekly' ? { week } : {}
      updateBlock(form.id, { ...base, ...weekField })
    } else addBlock({ ...base, week })
    onClose()
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-ink-soft">{t('course')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {courses.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => set('courseId', c.id)}
              aria-pressed={form.courseId === c.id}
              title={c.name}
              style={hueVars(c.hue)}
              className={clsx(
                'rounded-lg border-[1.5px] px-2.5 py-1 text-sm font-bold transition-colors',
                form.courseId === c.id
                  ? 'border-[var(--ink)] bg-[var(--hl)] text-[var(--ink)]'
                  : 'border-rule-strong text-ink-soft hover:border-[var(--ink)]',
              )}
            >
              {c.short}
            </button>
          ))}
        </div>
        {course && <p className="mt-1.5 text-sm text-ink-soft">{course.name}</p>}
      </fieldset>

      <div>
        <Label htmlFor="block-title">{t('whatWillYouDo')}</Label>
        <input
          id="block-title"
          data-autofocus
          className="field"
          placeholder={t('titlePlaceholder', { short: course?.short ?? '' })}
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
        />
        {suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-faint">{t('fromTodos')}</span>
            {suggestions.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => set('title', x.title)}
                className="max-w-full truncate rounded-md bg-pen-soft px-2 py-0.5 text-xs font-semibold text-pen hover:bg-pen hover:text-on-pen"
              >
                {x.title}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="block-day">{t('day')}</Label>
          <select id="block-day" className="field" value={form.day} onChange={(e) => set('day', Number(e.target.value))}>
            {daysLong.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="block-start">{t('from')}</Label>
          <select
            id="block-start"
            className="field"
            value={form.start}
            onChange={(e) => {
              const start = Number(e.target.value)
              setForm((f) => ({ ...f, start, end: Math.max(f.end, start + 30) }))
            }}
          >
            {TIME_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {hm(m)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="block-end">{t('to')}</Label>
          <select id="block-end" className="field" value={form.end} onChange={(e) => set('end', Number(e.target.value))}>
            {TIME_OPTIONS.filter((m) => m > form.start).map((m) => (
              <option key={m} value={m}>
                {hm(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label={t('repeat')}
          value={form.repeat}
          onChange={(v) => set('repeat', v)}
          options={[
            { value: 'weekly', label: t('everyWeek') },
            { value: 'once', label: t('onlyThisWeek') },
          ]}
        />
        <span className="text-sm text-ink-soft">
          {form.repeat === 'weekly'
            ? t('repeatWeeklyNote')
            : t('repeatOnceNote', {
                date: fmt(parseISO(draft.repeat === 'once' && draft.week ? draft.week : week), 'd MMMM'),
              })}
        </span>
      </div>

      {form.id && (
        <label className="flex items-center gap-2.5 text-sm font-semibold" style={course ? hueVars(course.hue) : undefined}>
          <Tick checked={isDone} onChange={() => toggleDone(form.id!, week)} label={t('doneThisWeek')} />
          {t('doneThisWeek')}
        </label>
      )}

      <div className="flex items-center gap-2 border-t border-rule pt-4">
        {form.id && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              removeBlock(form.id!)
              onClose()
            }}
          >
            <Trash2 size={16} /> {t('delete')}
          </button>
        )}
        <div className="ml-auto flex gap-2">
          {form.id && (
            <button
              type="button"
              className="btn btn-quiet text-pen"
              onClick={() => {
                const focus = useFocus.getState()
                if (focus.phase !== 'focus' || focus.status === 'idle') focus.setPhase('focus')
                focus.setTarget({ courseId: form.courseId, blockId: form.id, label: form.title })
                focus.setOpen(true)
                focus.start()
                onClose()
              }}
            >
              <Timer size={16} /> {t('startFocus')}
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="submit" className="btn btn-primary">
            {t(form.id ? 'saveChanges' : 'addToWeek')}
          </button>
        </div>
      </div>
    </form>
  )
}
