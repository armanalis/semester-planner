import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns'

/** 510 → "8:30" */
export const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

export const range = (start: number, end: number) => `${hm(start)}–${hm(end)}`

export const mondayOf = (d: Date) => startOfWeek(d, { weekStartsOn: 1 })
export const weekKey = (d: Date) => format(mondayOf(d), 'yyyy-MM-dd')
export const isoDay = (d: Date) => format(d, 'yyyy-MM-dd')

/** 0 = Monday … 6 = Sunday */
export const dayIndex = (d: Date) => (d.getDay() + 6) % 7

export const minutesNow = (d = new Date()) => d.getHours() * 60 + d.getMinutes()

export const weekDates = (monday: Date) => Array.from({ length: 7 }, (_, i) => addDays(monday, i))

/** Time options every 30 minutes for selects. */
export const TIME_OPTIONS = Array.from({ length: (23 - 7) * 2 + 1 }, (_, i) => 7 * 60 + i * 30)

export function daysUntil(date: string, today = new Date()) {
  return differenceInCalendarDays(parseISO(date), today)
}
