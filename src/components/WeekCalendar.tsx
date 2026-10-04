import clsx from 'clsx'
import { format, isSameDay } from 'date-fns'
import { Check } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { hueVars } from '../lib/hues'
import { useT } from '../lib/i18n'
import { hm, minutesNow, range, weekDates } from '../lib/time'
import type { Course, Slot, StudyBlock } from '../types'

export const START_H = 8
export const END_H = 21
const HOUR = 56
const PX = HOUR / 60
const DAY_START = START_H * 60
const DAY_END = END_H * 60

export interface Deadline {
  key: string
  courseId: string
  label: string
  strong?: boolean
}

type Item =
  | { kind: 'slot'; start: number; end: number; slot: Slot }
  | { kind: 'block'; start: number; end: number; block: StudyBlock }

/** Side-by-side columns for overlapping items, like the Polito timetable. */
function layoutDay(items: Item[]) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const out: (Item & { col: number; cols: number })[] = []
  let cluster: (Item & { col: number })[] = []
  let colEnds: number[] = []
  let clusterEnd = -Infinity
  const flush = () => {
    for (const c of cluster) out.push({ ...c, cols: colEnds.length })
    cluster = []
    colEnds = []
  }
  for (const it of sorted) {
    if (it.start >= clusterEnd) {
      flush()
      clusterEnd = -Infinity
    }
    let col = colEnds.findIndex((e) => e <= it.start)
    if (col === -1) {
      col = colEnds.length
      colEnds.push(it.end)
    } else colEnds[col] = it.end
    cluster.push({ ...it, col })
    clusterEnd = Math.max(clusterEnd, it.end)
  }
  flush()
  return out
}

const snap = (m: number) => Math.round(m / 30) * 30
const clampDay = (m: number) => Math.min(DAY_END, Math.max(DAY_START, m))

/** Where a study block is being dragged to. */
interface Moving {
  id: string
  day: number
  start: number
  end: number
}

export function WeekCalendar({
  monday,
  days,
  courses,
  slots,
  blocks,
  isDone,
  isSkipped,
  deadlines,
  onSlotClick,
  onBlockClick,
  onToggleDone,
  onCreate,
  onMoveBlock,
  onDeadlineClick,
}: {
  monday: Date
  days: number[]
  courses: Course[]
  slots: Slot[]
  blocks: StudyBlock[]
  isDone: (blockId: string) => boolean
  isSkipped: (slot: Slot) => boolean
  deadlines: Deadline[][]
  onSlotClick: (slot: Slot) => void
  onBlockClick: (block: StudyBlock) => void
  onToggleDone: (block: StudyBlock) => void
  onCreate: (day: number, start: number, end: number) => void
  onMoveBlock: (id: string, day: number, start: number, end: number) => void
  onDeadlineClick: (d: Deadline) => void
}) {
  const T = useT()
  const dates = weekDates(monday)
  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses])
  const [now, setNow] = useState(() => new Date())
  const [drag, setDrag] = useState<{ day: number; anchor: number; start: number; end: number; moved: boolean } | null>(
    null,
  )
  const [moving, setMoving] = useState<Moving | null>(null)
  const colRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const suppressClick = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const byDay = useMemo(
    () =>
      days.map((d) =>
        layoutDay([
          ...slots.filter((s) => s.day === d).map((slot) => ({ kind: 'slot' as const, start: slot.start, end: slot.end, slot })),
          ...blocks.filter((b) => b.day === d).map((block) => ({ kind: 'block' as const, start: block.start, end: block.end, block })),
        ]),
      ),
    [days, slots, blocks],
  )

  const hasDeadlines = days.some((d) => deadlines[d]?.length)
  const cols = { gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(0, 1fr))` }

  const minuteIn = (el: HTMLElement, clientY: number) => DAY_START + (clientY - el.getBoundingClientRect().top) / PX

  // drag on empty space → new study block
  const onDown = (day: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return
    const m = clampDay(Math.floor(minuteIn(e.currentTarget, e.clientY) / 30) * 30)
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ day, anchor: m, start: m, end: Math.min(DAY_END, m + 30), moved: false })
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const m = clampDay(snap(minuteIn(e.currentTarget, e.clientY)))
    const start = Math.min(drag.anchor, m)
    const end = Math.max(drag.anchor + 30, m)
    if (start !== drag.start || end !== drag.end) setDrag({ ...drag, start, end, moved: true })
  }
  const onUp = () => {
    if (!drag) return
    const end = drag.moved ? drag.end : Math.min(DAY_END, drag.start + 60)
    onCreate(drag.day, drag.start, end)
    setDrag(null)
  }

  // drag a study block → move it (any day, any time) or resize it from the bottom edge
  const beginBlockDrag = (e: ReactPointerEvent, block: StudyBlock, mode: 'move' | 'resize') => {
    if (e.button !== 0 || e.pointerType === 'touch') return
    if ((e.target as HTMLElement).closest('[role="checkbox"]')) return
    e.stopPropagation()
    e.preventDefault()
    const col = colRefs.current[block.day]
    if (!col) return
    const offset = minuteIn(col, e.clientY) - block.start
    const length = block.end - block.start
    const startX = e.clientX
    const startY = e.clientY
    let active = false
    let target: Moving = { id: block.id, day: block.day, start: block.start, end: block.end }

    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return
      active = true
      if (mode === 'move') {
        let day = block.day
        for (const d of days) {
          const r = colRefs.current[d]?.getBoundingClientRect()
          if (r && ev.clientX >= r.left && ev.clientX < r.right) day = d
        }
        const colEl = colRefs.current[day]!
        const start = Math.min(DAY_END - length, Math.max(DAY_START, snap(minuteIn(colEl, ev.clientY) - offset)))
        target = { id: block.id, day, start, end: start + length }
      } else {
        const end = Math.min(DAY_END, Math.max(block.start + 30, snap(minuteIn(col, ev.clientY))))
        target = { id: block.id, day: block.day, start: block.start, end }
      }
      setMoving(target)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      if (active) {
        suppressClick.current = true
        setTimeout(() => (suppressClick.current = false), 0)
        if (target.day !== block.day || target.start !== block.start || target.end !== block.end)
          onMoveBlock(block.id, target.day, target.start, target.end)
      }
      setMoving(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }

  const movingBlock = moving && blocks.find((b) => b.id === moving.id)

  return (
    <div className="max-md:overflow-x-auto" style={{ '--hour': `${HOUR}px` } as CSSProperties}>
      <div className="min-w-[760px]">
        {/* day header */}
        <div className="sticky top-0 z-20 grid border-b border-rule-strong bg-paper/95 backdrop-blur-sm" style={cols}>
          <div />
          {days.map((d) => {
            const date = dates[d]
            const today = isSameDay(date, now)
            return (
              <div key={d} className="flex items-baseline gap-1.5 px-2 pt-1 pb-2">
                <span className={clsx('text-sm', today ? 'font-bold text-pen' : 'text-ink-soft')}>{T.days[d]}</span>
                <span
                  className={clsx(
                    'text-xl leading-none font-bold',
                    today && 'rounded-md bg-pen px-1.5 py-0.5 text-on-pen',
                    d >= 5 && !today && 'text-ink-soft',
                  )}
                >
                  {format(date, 'd')}
                </span>
              </div>
            )
          })}
        </div>

        {/* deadlines for the week */}
        {hasDeadlines && (
          <div className="grid border-b border-rule-strong" style={cols}>
            <div className="self-center pr-2 text-right text-2xs text-ink-faint">{T.t('due')}</div>
            {days.map((d) => (
              <div key={d} className="flex min-w-0 flex-col gap-1 border-l border-rule px-1 py-1.5">
                {deadlines[d]?.map((dl) => {
                  const c = courseById[dl.courseId]
                  return (
                    <button
                      key={dl.key}
                      onClick={() => onDeadlineClick(dl)}
                      style={c ? hueVars(c.hue) : undefined}
                      title={`${c?.short ?? ''}: ${dl.label}`}
                      className={clsx(
                        'truncate rounded border-l-[3px] border-[var(--ink)] px-1.5 py-0.5 text-left text-2xs font-semibold text-ink',
                        dl.strong ? 'bg-[var(--hl)]' : 'bg-[color-mix(in_srgb,var(--hl)_45%,var(--color-sheet))]',
                      )}
                    >
                      {dl.label}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {/* time grid */}
        <div className="grid" style={cols}>
          <div className="relative" style={{ height: (END_H - START_H) * HOUR }}>
            {Array.from({ length: END_H - START_H }, (_, i) => (
              <span
                key={i}
                className="absolute right-2 -translate-y-1/2 text-2xs text-ink-faint first:translate-y-0"
                style={{ top: i * HOUR }}
              >
                {START_H + i}:00
              </span>
            ))}
          </div>

          {days.map((d, di) => {
            const today = isSameDay(dates[d], now)
            const nowM = minutesNow(now)
            return (
              <div
                key={d}
                ref={(el) => {
                  colRefs.current[d] = el
                }}
                onPointerDown={onDown(d)}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={() => setDrag(null)}
                className={clsx(
                  'quadretti relative cursor-cell touch-pan-y border-l border-rule-strong select-none',
                  d >= 5 && 'bg-paper',
                )}
                style={{ height: (END_H - START_H) * HOUR }}
              >
                {byDay[di].map((it) => {
                  const top = (Math.max(it.start, DAY_START) - DAY_START) * PX
                  const height = Math.max(22, (Math.min(it.end, DAY_END) - Math.max(it.start, DAY_START)) * PX - 2)
                  const pos: CSSProperties = {
                    top: top + 1,
                    height,
                    left: `calc(${(it.col / it.cols) * 100}% + 3px)`,
                    width: `calc(${100 / it.cols}% - 6px)`,
                  }
                  if (it.kind === 'slot') {
                    const c = courseById[it.slot.courseId]
                    if (!c) return null
                    return (
                      <SlotBlock
                        key={it.slot.id}
                        slot={it.slot}
                        skipped={isSkipped(it.slot)}
                        course={c}
                        style={pos}
                        wide={it.cols === 1}
                        onClick={() => onSlotClick(it.slot)}
                      />
                    )
                  }
                  const c = courseById[it.block.courseId]
                  if (!c) return null
                  return (
                    <StudyBlockView
                      key={it.block.id}
                      block={it.block}
                      course={c}
                      done={isDone(it.block.id)}
                      dragging={moving?.id === it.block.id}
                      style={pos}
                      onOpen={() => {
                        if (!suppressClick.current) onBlockClick(it.block)
                      }}
                      onToggle={() => onToggleDone(it.block)}
                      onDragStart={(e, mode) => beginBlockDrag(e, it.block, mode)}
                    />
                  )
                })}

                {moving?.day === d && movingBlock && (
                  <div
                    style={{
                      ...hueVars(courseById[movingBlock.courseId]?.hue ?? 'slate'),
                      top: (moving.start - DAY_START) * PX + 1,
                      height: (moving.end - moving.start) * PX - 2,
                    }}
                    className="pointer-events-none absolute inset-x-1 z-10 rounded-md border-[1.5px] border-[var(--ink)] bg-[color-mix(in_srgb,var(--hl)_60%,var(--color-sheet))] px-2 py-1 shadow-lg"
                  >
                    <span className="block truncate text-[13px] font-semibold text-ink">{movingBlock.title}</span>
                    <span className="block text-2xs text-[var(--ink)]">{range(moving.start, moving.end)}</span>
                  </div>
                )}

                {drag?.day === d && (
                  <div
                    className="pointer-events-none absolute inset-x-1 z-10 rounded-md border-[1.5px] border-dashed border-pen bg-pen-soft/80 px-2 py-1 text-2xs font-semibold text-pen"
                    style={{ top: (drag.start - DAY_START) * PX + 1, height: (drag.end - drag.start) * PX - 2 }}
                  >
                    {range(drag.start, drag.moved ? drag.end : Math.min(DAY_END, drag.start + 60))}
                  </div>
                )}

                {today && nowM >= DAY_START && nowM <= DAY_END && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-margin"
                    style={{ top: (nowM - DAY_START) * PX }}
                    aria-label={T.t('nowAt', { time: hm(nowM) })}
                  >
                    <span className="absolute -top-[5px] -left-[5px] size-2 rounded-full bg-margin" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SlotBlock({
  slot,
  skipped,
  course,
  style,
  wide,
  onClick,
}: {
  slot: Slot
  skipped: boolean
  course: Course
  style: CSSProperties
  wide: boolean
  onClick: () => void
}) {
  const { t, kind } = useT()
  const tall = slot.end - slot.start >= 150
  const kindLabel = slot.kind === 'lecture' ? '' : kind(slot.kind)
  const label = `${course.name}${kindLabel ? `, ${kindLabel}` : ''}, ${range(slot.start, slot.end)}${
    skipped ? t('skippedSuffix') : ''
  }`
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{ ...style, ...hueVars(course.hue) }}
      className={clsx('absolute flex flex-col items-start overflow-hidden px-2 py-1 text-left', skipped ? 'skipped' : 'highlighter')}
    >
      <span className={clsx('text-[13px] leading-tight font-bold', skipped ? 'text-ink-faint line-through' : 'text-[var(--ink)]')}>
        {course.short}
        {kindLabel && <span className="font-semibold"> {kindLabel}</span>}
      </span>
      <span className={clsx('text-2xs', skipped ? 'text-ink-faint' : 'text-[var(--ink)] opacity-75')}>
        {range(slot.start, slot.end)}
        {slot.room && `, ${slot.room}`}
      </span>
      {tall && wide && !skipped && <span className="mt-1 text-2xs leading-snug text-[var(--ink)] opacity-75">{course.name}</span>}
    </button>
  )
}

function StudyBlockView({
  block,
  course,
  done,
  dragging,
  style,
  onOpen,
  onToggle,
  onDragStart,
}: {
  block: StudyBlock
  course: Course
  done: boolean
  dragging: boolean
  style: CSSProperties
  onOpen: () => void
  onToggle: () => void
  onDragStart: (e: ReactPointerEvent, mode: 'move' | 'resize') => void
}) {
  const { t } = useT()
  const compact = block.end - block.start <= 45
  return (
    <div
      data-done={done}
      onPointerDown={(e) => onDragStart(e, 'move')}
      style={{ ...style, ...hueVars(course.hue) }}
      className={clsx(
        'pen-block group absolute z-[1] flex cursor-grab gap-1.5 overflow-hidden px-1.5 active:cursor-grabbing',
        compact ? 'items-center' : 'items-start py-1',
        dragging && 'opacity-30',
      )}
    >
      <button
        role="checkbox"
        aria-checked={done}
        aria-label={t('markDone', { title: block.title })}
        onClick={onToggle}
        className={clsx(
          'mt-px grid size-4 shrink-0 cursor-pointer place-items-center rounded-full border-[1.5px] border-[var(--ink)]',
          done ? 'bg-[var(--ink)]' : 'bg-sheet hover:bg-[var(--hl)]',
        )}
      >
        {done && <Check size={10} strokeWidth={3.5} className="text-sheet" />}
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 cursor-[inherit] text-left" title={`${block.title}, ${range(block.start, block.end)}`}>
        <span className={clsx('block truncate text-[13px] leading-tight font-semibold text-ink', compact && 'inline')}>
          {block.title}
        </span>
        {!compact && (
          <span className="block truncate text-2xs text-[var(--ink)]">
            {course.short}, {range(block.start, block.end)}
          </span>
        )}
      </button>
      {/* bottom edge: drag to make the block longer or shorter */}
      <div
        onPointerDown={(e) => onDragStart(e, 'resize')}
        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      >
        <div className="mx-auto mt-0.5 h-0.5 w-6 rounded-full bg-[var(--ink)]" />
      </div>
    </div>
  )
}
