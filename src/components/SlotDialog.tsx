import clsx from 'clsx'
import { addDays, parseISO } from 'date-fns'
import { BookOpen, CalendarOff, CalendarX2, Check } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { hueVars } from '../lib/hues'
import { useT, type T } from '../lib/i18n'
import { isoDay, range } from '../lib/time'
import { usePlanner } from '../store'
import type { SlotKind } from '../types'
import { Dialog, Label, Segmented } from './ui'

export const kindOptions = (T: T): { value: SlotKind; label: string }[] =>
  (['lecture', 'lab', 'practice'] as const).map((value) => ({ value, label: T.kind(value) }))

type Choice = 'keep' | 'week' | 'all'

/** Click on a class: keep it, skip it this week, or skip it every week. Plus type and room. */
export function SlotDialog({ slotId, week, onClose }: { slotId: string | null; week: string; onClose: () => void }) {
  const slot = usePlanner((s) => s.slots.find((x) => x.id === slotId))
  const course = usePlanner((s) => s.courses.find((c) => c.id === slot?.courseId))

  return (
    <Dialog
      open={!!slot && !!course}
      onClose={onClose}
      wide
      title={
        course && (
          <span style={hueVars(course.hue)} className="flex items-start gap-2.5">
            <span className="course-block mt-1.5 size-3 shrink-0 rounded-full" aria-hidden />
            {course.name}
          </span>
        )
      }
    >
      {slot && course && <SlotForm slotId={slot.id} week={week} onClose={onClose} />}
    </Dialog>
  )
}

function SlotForm({ slotId, week, onClose }: { slotId: string; week: string; onClose: () => void }) {
  const T = useT()
  const { t, fmt } = T
  const slot = usePlanner((s) => s.slots.find((x) => x.id === slotId))!
  const course = usePlanner((s) => s.courses.find((c) => c.id === slot.courseId))!
  const skips = usePlanner((s) => s.skips)
  const { updateSlot, skipForWeek, unskipForWeek, addTask } = usePlanner.getState()
  const [catchUp, setCatchUp] = useState(true)

  const key = `${slot.id}|${week}`
  const skippedThisWeek = key in skips
  const choice: Choice = !slot.attending ? 'all' : skippedThisWeek ? 'week' : 'keep'
  const classDate = addDays(parseISO(week), slot.day)

  const choose = (c: Choice) => {
    if (c === choice) return
    if (c !== 'week' && skippedThisWeek) unskipForWeek(slot.id, week)
    if (c === 'keep') updateSlot(slot.id, { attending: true })
    if (c === 'all') updateSlot(slot.id, { attending: false })
    if (c === 'week') {
      updateSlot(slot.id, { attending: true })
      const taskId = catchUp
        ? addTask(
            course.id,
            t('catchUpTitle', {
              dayShort: T.days[slot.day],
              dayLong: T.daysLong[slot.day],
              date: fmt(classDate, 'd MMM'),
              kind: T.kindLower(slot.kind),
            }),
            isoDay(addDays(classDate, 2)),
          )
        : ''
      skipForWeek(slot.id, week, taskId)
    }
  }

  const options: { value: Choice; label: string; hint: string; icon: typeof Check }[] = [
    { value: 'keep', label: t('keepIt'), hint: t('keepItHint'), icon: Check },
    {
      value: 'week',
      label: t('skipWeek'),
      hint: t('skipWeekHint', { date: fmt(parseISO(week), 'd MMMM') }),
      icon: CalendarX2,
    },
    { value: 'all', label: t('skipAll'), hint: t('skipAllHint'), icon: CalendarOff },
  ]

  return (
    <div className="space-y-5" style={hueVars(course.hue)}>
      <p className="-mt-2 text-ink-soft">
        {T.daysLong[slot.day]} {fmt(classDate, 'd MMMM')}, {range(slot.start, slot.end)}
      </p>

      <fieldset>
        <legend className="mb-2 font-bold">{t('goingQuestion')}</legend>
        <div className="space-y-2" role="radiogroup">
          {options.map(({ value, label, hint, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={choice === value}
              onClick={() => choose(value)}
              className={clsx(
                'flex w-full items-start gap-3 rounded-xl border-[1.5px] px-3 py-2.5 text-left transition-colors',
                choice === value
                  ? value === 'keep'
                    ? 'border-[var(--ink)] bg-[color-mix(in_srgb,var(--hl)_45%,var(--color-sheet))]'
                    : 'border-danger bg-danger-soft'
                  : 'border-rule-strong hover:border-ink-faint',
              )}
            >
              <Icon
                size={18}
                className={clsx('mt-0.5 shrink-0', choice === value ? (value === 'keep' ? 'text-[var(--ink)]' : 'text-danger') : 'text-ink-faint')}
              />
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="block text-sm text-ink-soft">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        {choice !== 'week' && (
          <label className="mt-2 flex cursor-pointer items-center gap-2 pl-1 text-sm text-ink-soft">
            <input type="checkbox" checked={catchUp} onChange={(e) => setCatchUp(e.target.checked)} className="accent-[var(--color-pen)]" />
            {t('addCatchUp')}
          </label>
        )}
      </fieldset>

      <fieldset className="border-t border-rule pt-4">
        <legend className="sr-only">{t('classSettings')}</legend>
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <div>
            <Label>{t('type')}</Label>
            <Segmented label={t('type')} value={slot.kind} options={kindOptions(T)} onChange={(kind) => updateSlot(slot.id, { kind })} />
          </div>
          <div>
            <Label htmlFor="slot-room">{t('room')}</Label>
            <input
              id="slot-room"
              className="field"
              placeholder={t('roomPlaceholder')}
              value={slot.room}
              onChange={(e) => updateSlot(slot.id, { room: e.target.value })}
            />
          </div>
        </div>
        {slot.kind === 'lab' && <p className="mt-2 text-sm text-ink-soft">{t('labHint')}</p>}
      </fieldset>

      <div className="flex items-center justify-between border-t border-rule pt-4">
        <Link to={`/course/${course.id}`} onClick={onClose} className="btn btn-quiet -ml-3">
          <BookOpen size={16} /> {t('openCourse')}
        </Link>
        <button className="btn btn-primary" onClick={onClose}>
          {t('done')}
        </button>
      </div>
    </div>
  )
}
