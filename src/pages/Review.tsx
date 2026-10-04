import clsx from 'clsx'
import { addDays, addWeeks, isSameWeek, parseISO } from 'date-fns'
import { BrainCircuit, CalendarPlus, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BlockDialog, type BlockDraft } from '../components/BlockDialog'
import { StatTile } from '../components/charts'
import { DueChip } from '../components/course/Todos'
import { useDueTopics } from '../components/TopicReview'
import { Section, Tick } from '../components/ui'
import { hueVars } from '../lib/hues'
import { useT } from '../lib/i18n'
import { skipsInWeek } from '../lib/stats'
import { isoDay, mondayOf, range, weekDates, weekKey } from '../lib/time'
import { useUI } from '../lib/ui'
import { blocksForWeek, usePlanner } from '../store'
import type { Course } from '../types'

export default function Review() {
  const T = useT()
  const { t, fmt, hours } = T
  const data = usePlanner()
  const { toggleDone, toggleTask, setReview, addTask } = usePlanner.getState()
  const dueTopics = useDueTopics().length
  const openReview = useUI((s) => s.setReviewOpen)

  const [monday, setMonday] = useState(() => mondayOf(new Date()))
  const [draft, setDraft] = useState<BlockDraft | null>(null)
  const week = weekKey(monday)
  const nextWeek = weekKey(addWeeks(monday, 1))
  const isThisWeek = isSameWeek(monday, new Date(), { weekStartsOn: 1 })
  const courseById = useMemo(() => Object.fromEntries(data.courses.map((c) => [c.id, c])), [data.courses])

  const weekBlocks = blocksForWeek(data.blocks, week).sort((a, b) => a.day - b.day || a.start - b.start)
  const unfinished = weekBlocks.filter((b) => !data.done[`${b.id}|${week}`])
  const weekStart = monday.getTime()
  const weekEnd = addWeeks(monday, 1).getTime()
  const focusMin = data.sessions.filter((s) => s.start >= weekStart && s.start < weekEnd).reduce((n, s) => n + s.minutes, 0)
  const todosFinished = data.tasks.filter((x) => x.doneAt && x.doneAt >= weekStart && x.doneAt < weekEnd).length
  const skipped = skipsInWeek(data.skips, week)
  const today = isoDay(new Date())
  const overdue = data.tasks.filter((x) => !x.done && x.due && x.due < today).sort((a, b) => a.due.localeCompare(b.due))
  const nextDates = weekDates(addWeeks(monday, 1)).map(isoDay)
  const upcoming = [
    ...data.tasks.filter((x) => !x.done && nextDates.includes(x.due)).map((x) => ({ key: x.id, courseId: x.courseId, title: x.title, due: x.due })),
    ...data.projects.filter((p) => nextDates.includes(p.due)).map((p) => ({ key: p.id, courseId: p.courseId, title: p.title, due: p.due })),
    ...data.courses.filter((c) => nextDates.includes(c.examDate)).map((c) => ({ key: `exam-${c.id}`, courseId: c.id, title: t('examOf', { short: c.short }), due: c.examDate })),
  ].sort((a, b) => a.due.localeCompare(b.due))

  const review = data.reviews[week] ?? { well: '', hard: '', change: '', doneAt: 0 }
  const sunday = weekDates(monday)[6]

  return (
    <div className="mx-auto max-w-[72rem] px-4 pt-8 pb-20 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('weeklyReview')}</h1>
          <div className="mt-1 flex items-center gap-1">
            <button className="btn btn-quiet -ml-2 p-1.5" aria-label={t('prevWeek')} onClick={() => setMonday((m) => addWeeks(m, -1))}>
              <ChevronLeft size={18} />
            </button>
            <span className="text-ink-soft">
              {fmt(monday, 'd MMM')} – {fmt(sunday, 'd MMM')}
            </span>
            <button className="btn btn-quiet p-1.5" aria-label={t('nextWeek')} onClick={() => setMonday((m) => addWeeks(m, 1))}>
              <ChevronRight size={18} />
            </button>
            {!isThisWeek && (
              <button className="btn btn-quiet py-1 text-pen" onClick={() => setMonday(mondayOf(new Date()))}>
                {t('thisWeek')}
              </button>
            )}
          </div>
        </div>
        {review.doneAt > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-pen-soft px-3 py-1 text-sm font-bold text-pen">
            <Check size={16} /> {t('reviewedBadge')}
          </span>
        )}
      </header>

      <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
        <StatTile label={t('tileBlocks')} value={`${weekBlocks.length - unfinished.length}/${weekBlocks.length}`} />
        <StatTile label={t('tileFocus')} value={hours(focusMin)} />
        <StatTile label={t('tileTodos')} value={todosFinished} />
        <StatTile label={t('tileSkipped')} value={skipped.length} />
      </div>

      <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-2">
        <Section title={t('unfinishedTitle')} aside={unfinished.length || undefined}>
          {unfinished.length === 0 ? (
            <p className="text-sm text-ink-soft">{weekBlocks.length ? t('unfinishedEmpty') : t('noBlocksYet')}</p>
          ) : (
            <ul className="divide-y divide-rule">
              {unfinished.map((b) => (
                <li key={b.id} className="py-2" style={courseById[b.courseId] ? hueVars(courseById[b.courseId].hue) : undefined}>
                  <div className="flex items-center gap-3">
                    <CourseChip course={courseById[b.courseId]} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{b.title}</span>
                    <span className="shrink-0 text-xs text-ink-soft">
                      {T.days[b.day]} {range(b.start, b.end)}
                    </span>
                  </div>
                  <span className="mt-0.5 -ml-3 flex flex-wrap">
                    <button className="btn btn-quiet py-1 text-sm" onClick={() => toggleDone(b.id, week)}>
                      <Check size={15} /> {t('doneAfterAll')}
                    </button>
                    <button
                      className="btn btn-quiet py-1 text-sm text-pen"
                      onClick={() => setDraft({ courseId: b.courseId, day: b.day, start: b.start, end: b.end, title: b.title, repeat: 'once' })}
                    >
                      <CalendarPlus size={15} /> {t('planAgain')}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('catchUpSection')} aside={skipped.length || undefined}>
          {skipped.length === 0 ? (
            <p className="text-sm text-ink-soft">{t('catchUpEmpty')}</p>
          ) : (
            <ul className="divide-y divide-rule">
              {skipped.map(({ slotId, taskId }) => {
                const slot = data.slots.find((s) => s.id === slotId)
                if (!slot) return null
                const course = courseById[slot.courseId]
                const task = data.tasks.find((x) => x.id === taskId)
                const classDate = addDays(monday, slot.day)
                return (
                  <li key={slotId} className="flex items-center gap-3 py-2" style={course ? hueVars(course.hue) : undefined}>
                    {task ? (
                      <Tick checked={task.done} onChange={() => toggleTask(task.id)} label={t('doneLabel', { title: task.title })} />
                    ) : (
                      <span className="size-5" />
                    )}
                    <CourseChip course={course} />
                    <span className="min-w-0 flex-1">
                      <span className={clsx('block font-semibold', task?.done && 'text-ink-faint line-through')}>
                        {T.days[slot.day]} {fmt(classDate, 'd MMM')}, {T.kindLower(slot.kind)}
                      </span>
                      <span className="block text-xs text-ink-soft">{range(slot.start, slot.end)}</span>
                    </span>
                    {!task && course && (
                      <button
                        className="btn btn-quiet py-1 text-sm text-pen"
                        onClick={() => {
                          const id = addTask(
                            course.id,
                            t('catchUpTitle', { dayShort: T.days[slot.day], dayLong: T.daysLong[slot.day], date: fmt(classDate, 'd MMM'), kind: T.kindLower(slot.kind) }),
                            isoDay(addDays(classDate, 2)),
                          )
                          usePlanner.getState().skipForWeek(slot.id, week, id)
                        }}
                      >
                        {t('addCatchUpNow')}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Section>

        <Section title={t('overdueTitle')} aside={overdue.length || undefined}>
          {overdue.length === 0 ? (
            <p className="text-sm text-ink-soft">{t('overdueEmpty')}</p>
          ) : (
            <ul className="divide-y divide-rule">
              {overdue.map((x) => (
                <li key={x.id} className="flex items-center gap-3 py-2" style={courseById[x.courseId] ? hueVars(courseById[x.courseId].hue) : undefined}>
                  <Tick checked={x.done} onChange={() => toggleTask(x.id)} label={t('doneLabel', { title: x.title })} />
                  <CourseChip course={courseById[x.courseId]} />
                  <span className="min-w-0 flex-1 truncate">{x.title}</span>
                  <DueChip due={x.due} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('nextWeekTitle')} aside={upcoming.length || undefined}>
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-soft">{t('nextWeekEmpty')}</p>
          ) : (
            <ul className="divide-y divide-rule">
              {upcoming.map((x) => (
                <li key={x.key} className="flex items-center gap-3 py-2" style={courseById[x.courseId] ? hueVars(courseById[x.courseId].hue) : undefined}>
                  <CourseChip course={courseById[x.courseId]} />
                  <span className="min-w-0 flex-1 truncate">{x.title}</span>
                  <span className="text-sm text-ink-soft">{fmt(parseISO(x.due), 'EEE d MMM')}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('topicsDueTitle')}>
          {dueTopics === 0 ? (
            <p className="text-sm text-ink-soft">{t('noTopicsDue')}</p>
          ) : (
            <button className="btn btn-primary" onClick={() => openReview(true)}>
              <BrainCircuit size={16} /> {t(dueTopics === 1 ? 'topicToReview' : 'topicsToReview', { n: dueTopics })}
            </button>
          )}
        </Section>
      </div>

      <Section title={t('reflectTitle')} aside={t('savedAsYouType')} className="mt-10">
        <div className="grid gap-4 md:grid-cols-3">
          {(
            [
              ['well', t('reflectWell')],
              ['hard', t('reflectHard')],
              ['change', t('reflectChange')],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-sm font-semibold text-ink-soft">{label}</span>
              <textarea
                className="field min-h-28 resize-y leading-relaxed"
                value={review[key]}
                onChange={(e) => setReview(week, { [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          {review.doneAt > 0 ? (
            <>
              <span className="text-sm text-ink-soft">{t('reviewFinishedOn', { date: fmt(new Date(review.doneAt), 'd MMM, HH:mm') })}</span>
              <button className="btn btn-quiet" onClick={() => setReview(week, { doneAt: 0 })}>
                {t('reopenReview')}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setReview(week, { doneAt: Date.now() })}>
              <Check size={16} /> {t('finishReview')}
            </button>
          )}
        </div>
      </Section>

      <BlockDialog draft={draft} week={nextWeek} onClose={() => setDraft(null)} />
    </div>
  )
}

function CourseChip({ course }: { course?: Course }) {
  if (!course) return null
  return <span className="shrink-0 rounded bg-[var(--hl)] px-1.5 py-0.5 text-xs font-bold text-[var(--ink)]">{course.short}</span>
}

