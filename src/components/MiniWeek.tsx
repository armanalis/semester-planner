import type { CSSProperties } from 'react'
import { hueVars } from '../lib/hues'
import { useT } from '../lib/i18n'
import type { HueKey } from '../types'
import { layoutDay } from './WeekCalendar'

export interface MiniCourse {
  id: string
  short: string
  hue: HueKey
}
export interface MiniSlot {
  id: string
  courseId: string
  day: number
  start: number
  end: number
}

const HOUR = 30

/** A small read-only week. Blocks draw in from left to right. */
export function MiniWeek({ courses, slots }: { courses: MiniCourse[]; slots: MiniSlot[] }) {
  const { days: dayNames } = useT()
  const byId = new Map(courses.map((c) => [c.id, c]))
  const valid = slots.filter((s) => byId.has(s.courseId) && s.end > s.start)
  const days = valid.some((s) => s.day >= 5) ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4]
  const startH = Math.min(8, ...valid.map((s) => Math.floor(s.start / 60)))
  const endH = Math.max(19, ...valid.map((s) => Math.ceil(s.end / 60)))
  const height = (endH - startH) * HOUR
  let order = 0

  return (
    <div style={{ '--hour': `${HOUR}px` } as CSSProperties}>
      <div className="grid gap-px pl-8 text-2xs font-semibold text-ink-soft" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
        {days.map((d) => (
          <span key={d} className="px-1 pb-1.5">
            {dayNames[d]}
          </span>
        ))}
      </div>
      <div className="flex">
        <div className="relative w-8 shrink-0" style={{ height }}>
          {Array.from({ length: Math.floor((endH - startH) / 2) + 1 }, (_, i) => (
            <span key={i} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-ink-faint first:translate-y-0" style={{ top: i * 2 * HOUR }}>
              {startH + i * 2}
            </span>
          ))}
        </div>
        <div
          className="grid flex-1 overflow-hidden rounded-lg border border-rule-strong"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}
        >
          {days.map((d) => (
            <div key={d} className="hour-grid relative border-l border-rule-strong first:border-l-0" style={{ height }}>
              {layoutDay(valid.filter((s) => s.day === d)).map((s) => {
                const c = byId.get(s.courseId)!
                return (
                  <div
                    key={s.id}
                    className="course-block absolute overflow-hidden px-1 pt-0.5 text-[10px] leading-tight font-bold text-[var(--ink)] motion-safe:animate-[sweep_520ms_cubic-bezier(.3,.7,.2,1)_both]"
                    style={{
                      ...hueVars(c.hue),
                      top: (s.start / 60 - startH) * HOUR + 1,
                      height: ((s.end - s.start) / 60) * HOUR - 2,
                      left: `calc(${(s.col / s.cols) * 100}% + 2px)`,
                      width: `calc(${100 / s.cols}% - 4px)`,
                      animationDelay: `${Math.min(order++, 30) * 28}ms`,
                    }}
                  >
                    {c.short}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
