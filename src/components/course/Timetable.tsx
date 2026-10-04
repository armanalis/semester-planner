import clsx from 'clsx'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useT } from '../../lib/i18n'
import { TIME_OPTIONS, hm, range } from '../../lib/time'
import { usePlanner } from '../../store'
import type { Course, SlotKind } from '../../types'
import { kindOptions } from '../SlotDialog'
import { Section, Tick } from '../ui'

export function Timetable({ course }: { course: Course }) {
  const T = useT()
  const { t, days, daysLong, hours } = T
  const KIND_OPTIONS = kindOptions(T)
  const all = usePlanner((s) => s.slots)
  const { updateSlot, removeSlot, chooseLab, addSlot } = usePlanner.getState()
  const slots = useMemo(
    () => all.filter((s) => s.courseId === course.id).sort((a, b) => a.day - b.day || a.start - b.start),
    [all, course.id],
  )
  const labs = slots.filter((s) => s.kind === 'lab')
  const chosenLab = labs.filter((s) => s.attending).length === 1 ? labs.find((s) => s.attending) : undefined
  const weeklyMinutes = slots.filter((s) => s.attending).reduce((n, s) => n + s.end - s.start, 0)

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ day: 0, start: 510, end: 600, kind: 'lecture' as SlotKind })

  const add = (e: FormEvent) => {
    e.preventDefault()
    addSlot({ courseId: course.id, ...form, end: Math.max(form.end, form.start + 30), room: '', attending: true })
    setAdding(false)
  }

  return (
    <Section title={t('timetable')} aside={t('perWeek', { h: hours(weeklyMinutes) })}>
      <ul className="divide-y divide-rule">
        {slots.map((s) => (
          <li key={s.id} className="group flex items-center gap-2.5 py-1.5">
            <Tick
              size={18}
              checked={s.attending}
              onChange={() => updateSlot(s.id, { attending: !s.attending })}
              label={t('iGoTo', { when: `${daysLong[s.day]} ${range(s.start, s.end)}` })}
            />
            <span className={clsx('flex-1 text-sm', !s.attending && 'text-ink-faint line-through')}>
              <span className="inline-block w-9 font-semibold">{days[s.day]}</span>
              {range(s.start, s.end)}
            </span>
            <select
              className="rounded-md border border-transparent bg-transparent py-0.5 text-sm text-ink-soft hover:border-rule-strong"
              value={s.kind}
              onChange={(e) => updateSlot(s.id, { kind: e.target.value as SlotKind })}
              aria-label={t('type')}
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              className="btn btn-danger p-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100"
              onClick={() => removeSlot(s.id)}
              aria-label={t('removeNamed', { name: `${daysLong[s.day]} ${range(s.start, s.end)}` })}
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>

      {labs.length >= 2 ? (
        <fieldset className="mt-3 rounded-xl bg-[color-mix(in_srgb,var(--hl)_35%,var(--color-sheet))] p-3">
          <legend className="sr-only">{t('yourLabGroup')}</legend>
          <p className="mb-2 text-sm font-bold">{t('whichLab')}</p>
          <div className="space-y-1">
            {labs.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`lab-${course.id}`}
                  checked={chosenLab?.id === s.id}
                  onChange={() => chooseLab(course.id, s.id)}
                  className="accent-pen"
                />
                {daysLong[s.day]}, {range(s.start, s.end)}
              </label>
            ))}
          </div>
          {!chosenLab && <p className="mt-2 text-xs text-ink-soft">{t('otherGroupsHidden')}</p>}
        </fieldset>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">{t('labHintCourse')}</p>
      )}

      {adding ? (
        <form onSubmit={add} className="mt-3 grid grid-cols-2 gap-2">
          <select className="field" value={form.day} onChange={(e) => setForm({ ...form, day: +e.target.value })} aria-label={t('day')}>
            {daysLong.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
          <select className="field" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as SlotKind })} aria-label={t('type')}>
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select className="field" value={form.start} onChange={(e) => setForm({ ...form, start: +e.target.value })} aria-label={t('from')}>
            {TIME_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {hm(m)}
              </option>
            ))}
          </select>
          <select className="field" value={form.end} onChange={(e) => setForm({ ...form, end: +e.target.value })} aria-label={t('to')}>
            {TIME_OPTIONS.filter((m) => m > form.start).map((m) => (
              <option key={m} value={m}>
                {hm(m)}
              </option>
            ))}
          </select>
          <div className="col-span-2 flex justify-end gap-2">
            <button type="button" className="btn btn-quiet" onClick={() => setAdding(false)}>
              {t('cancel')}
            </button>
            <button className="btn btn-primary">{t('addClassTime')}</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-quiet mt-2 -ml-3 text-pen" onClick={() => setAdding(true)}>
          <Plus size={16} /> {t('addClassTime')}
        </button>
      )}
    </Section>
  )
}
