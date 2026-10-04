import { differenceInCalendarWeeks, isSameDay, parseISO } from 'date-fns'
import { useMemo } from 'react'
import { BarList, ColumnChart, LevelBars, PlanDoneColumns, StatTile } from '../components/charts'
import { Section } from '../components/ui'
import { swatch } from '../lib/hues'
import { useT } from '../lib/i18n'
import { blocksByWeek, focusByCourse, focusByDay, skipsByCourse, streak } from '../lib/stats'
import { usePlanner } from '../store'

export default function Stats() {
  const T = useT()
  const { t, fmt, hours } = T
  const data = usePlanner()
  const courseById = useMemo(() => Object.fromEntries(data.courses.map((c) => [c.id, c])), [data.courses])

  const days = useMemo(() => focusByDay(data.sessions, 14), [data.sessions])
  const perCourse = useMemo(() => focusByCourse(data.sessions, 28), [data.sessions])
  // from the first week of the semester, up to the last 8 weeks
  const weekCount = data.profile.semesterStart
    ? Math.min(8, Math.max(1, differenceInCalendarWeeks(new Date(), parseISO(data.profile.semesterStart), { weekStartsOn: 1 }) + 1))
    : 8
  const weeks = useMemo(() => blocksByWeek(data, weekCount), [data, weekCount])
  const skips = useMemo(() => skipsByCourse(data), [data])
  const totalFocus = data.sessions.reduce((n, s) => n + s.minutes, 0)
  const todosDone = data.tasks.filter((x) => x.done).length
  const confident = data.topics.filter((x) => x.level === 3).length
  const today = new Date()
  const levels = [t('level0'), t('level1'), t('level2'), t('level3')]

  const label = (courseId: string) => courseById[courseId]?.short ?? t('otherCourse')
  const chip = (courseId: string) => (courseById[courseId] ? swatch(courseById[courseId].hue) : undefined)

  return (
    <div className="mx-auto max-w-[76rem] px-4 pt-8 pb-20 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">{t('statistics')}</h1>

      <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
        <StatTile label={t('statFocusTotal')} value={hours(totalFocus)} />
        <StatTile label={t('statStreak')} value={streak(data)} hint={t('statStreakHint')} />
        <StatTile label={t('statTodosDone')} value={todosDone} />
        <StatTile label={t('statTopicsConfident')} value={`${confident}/${data.topics.length}`} />
      </div>

      <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-2">
        <Section title={t('chartFocusDays')}>
          {totalFocus === 0 ? (
            <p className="text-sm text-ink-soft">{t('noFocusYet')}</p>
          ) : (
            <ColumnChart
              label={t('chartFocusDays')}
              data={days.map((d) => ({
                key: d.date.toISOString(),
                value: d.minutes,
                tick: T.days[(d.date.getDay() + 6) % 7].slice(0, 2),
                tip: `${fmt(d.date, 'EEE d MMM')}: ${t('minutesShort', { n: d.minutes })}`,
                highlight: isSameDay(d.date, today),
              }))}
            />
          )}
        </Section>

        <Section title={t('chartFocusCourse')}>
          {perCourse.length === 0 ? (
            <p className="text-sm text-ink-soft">{t('noFocusYet')}</p>
          ) : (
            <BarList
              label={t('chartFocusCourse')}
              rows={perCourse.map((r) => ({
                key: r.courseId || 'none',
                label: label(r.courseId),
                swatch: chip(r.courseId),
                value: r.minutes,
                display: hours(r.minutes),
              }))}
            />
          )}
        </Section>

        <Section title={t('chartBlocksWeeks')}>
          {weeks.every((w) => w.planned === 0) ? (
            <p className="text-sm text-ink-soft">{t('noBlocksYet')}</p>
          ) : (
            <PlanDoneColumns
              label={t('chartBlocksWeeks')}
              legend={{ planned: t('planned'), done: t('doneWord') }}
              data={weeks.map((w) => ({
                key: w.week,
                planned: w.planned,
                done: w.done,
                tick: fmt(w.monday, 'd MMM'),
                tip: `${t('weekOf', { date: fmt(w.monday, 'd MMM') })}: ${w.done}/${w.planned}`,
              }))}
            />
          )}
        </Section>

        <Section title={t('chartTopics')}>
          {data.topics.length === 0 ? (
            <p className="text-sm text-ink-soft">{t('noTopicsYet')}</p>
          ) : (
            <LevelBars
              label={t('chartTopics')}
              levels={levels}
              rows={data.courses
                .map((c) => {
                  const counts = [0, 0, 0, 0]
                  for (const x of data.topics) if (x.courseId === c.id) counts[x.level]++
                  return { key: c.id, label: c.short, swatch: swatch(c.hue), counts }
                })
                .filter((r) => r.counts.some(Boolean))}
            />
          )}
        </Section>

        <Section title={t('chartSkipped')}>
          {skips.length === 0 ? (
            <p className="text-sm text-ink-soft">{t('noSkipsYet')}</p>
          ) : (
            <BarList
              label={t('chartSkipped')}
              rows={skips.map((r) => ({
                key: r.courseId,
                label: label(r.courseId),
                swatch: chip(r.courseId),
                value: r.count,
                display: String(r.count),
              }))}
            />
          )}
        </Section>
      </div>
    </div>
  )
}
