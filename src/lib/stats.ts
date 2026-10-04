import { addDays, addWeeks, format, parseISO, startOfDay } from 'date-fns'
import type { PlannerData } from '../store'
import { blocksForWeek } from '../store'
import { isoDay, mondayOf, weekKey } from './time'

/** Minutes of focus per day for the last `n` days, oldest first. */
export function focusByDay(sessions: PlannerData['sessions'], n: number, today = new Date()) {
  const start = startOfDay(addDays(today, -(n - 1)))
  const days = Array.from({ length: n }, (_, i) => ({ date: addDays(start, i), minutes: 0 }))
  for (const s of sessions) {
    const i = Math.floor((startOfDay(new Date(s.start)).getTime() - start.getTime()) / 86_400_000)
    if (i >= 0 && i < n) days[i].minutes += s.minutes
  }
  return days
}

/** Minutes of focus per course over the last `days` days, biggest first. */
export function focusByCourse(sessions: PlannerData['sessions'], days: number, today = new Date()) {
  const since = startOfDay(addDays(today, -(days - 1))).getTime()
  const totals = new Map<string, number>()
  for (const s of sessions) if (s.start >= since) totals.set(s.courseId, (totals.get(s.courseId) ?? 0) + s.minutes)
  return [...totals.entries()].map(([courseId, minutes]) => ({ courseId, minutes })).sort((a, b) => b.minutes - a.minutes)
}

/** Planned vs done study blocks for the last `n` weeks, oldest first. */
export function blocksByWeek(data: Pick<PlannerData, 'blocks' | 'done'>, n: number, today = new Date()) {
  const thisMonday = mondayOf(today)
  return Array.from({ length: n }, (_, i) => {
    const monday = addWeeks(thisMonday, i - (n - 1))
    const week = format(monday, 'yyyy-MM-dd')
    const planned = blocksForWeek(data.blocks, week)
    return { monday, week, planned: planned.length, done: planned.filter((b) => data.done[`${b.id}|${week}`]).length }
  })
}

/** Days in a row (ending today, or yesterday if today is still empty) with focus time or a finished study block. */
export function streak(data: Pick<PlannerData, 'sessions' | 'blocks' | 'done'>, today = new Date()) {
  const active = new Set<string>()
  for (const s of data.sessions) active.add(isoDay(new Date(s.start)))
  const blockDay = new Map(data.blocks.map((b) => [b.id, b.day]))
  for (const key of Object.keys(data.done)) {
    const [id, week] = key.split('|')
    const day = blockDay.get(id)
    if (day !== undefined) active.add(isoDay(addDays(parseISO(week), day)))
  }
  let d = startOfDay(today)
  if (!active.has(isoDay(d))) d = addDays(d, -1)
  let n = 0
  while (active.has(isoDay(d))) {
    n++
    d = addDays(d, -1)
  }
  return n
}

/** One-week skips per course (each one is a class you missed). */
export function skipsByCourse(data: Pick<PlannerData, 'skips' | 'slots'>) {
  const courseOf = new Map(data.slots.map((s) => [s.id, s.courseId]))
  const counts = new Map<string, number>()
  for (const key of Object.keys(data.skips)) {
    const courseId = courseOf.get(key.split('|')[0])
    if (courseId) counts.set(courseId, (counts.get(courseId) ?? 0) + 1)
  }
  return [...counts.entries()].map(([courseId, count]) => ({ courseId, count })).sort((a, b) => b.count - a.count)
}

/** Skips that fall in a given week. */
export const skipsInWeek = (skips: PlannerData['skips'], week: string) =>
  Object.entries(skips)
    .filter(([key]) => key.endsWith(`|${week}`))
    .map(([key, taskId]) => ({ slotId: key.split('|')[0], taskId }))

export const thisWeek = () => weekKey(new Date())
