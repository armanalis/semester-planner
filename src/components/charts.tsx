import clsx from 'clsx'
import type { ReactNode } from 'react'

/**
 * Small chart kit for the stats and review pages.
 * One ink color for marks; identity comes from text labels (course short names), not color.
 * Thin bars, 4px rounded ends anchored to the baseline, 2px gaps, a tooltip on hover and focus.
 */

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0" title={hint}>
      <p className="text-3xl leading-tight font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm text-ink-soft">{label}</p>
    </div>
  )
}

function Tip({ children, side = 'top' }: { children: ReactNode; side?: 'top' | 'right' }) {
  return (
    <span
      role="tooltip"
      className={clsx(
        'pointer-events-none absolute z-10 rounded-md bg-ink px-2 py-1 text-xs font-semibold whitespace-nowrap text-paper opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
        side === 'top' ? 'bottom-full left-1/2 mb-1.5 -translate-x-1/2' : 'top-1/2 left-full ml-2 -translate-y-1/2',
      )}
    >
      {children}
    </span>
  )
}

/** Vertical bars over time (one series). */
export function ColumnChart({
  data,
  height = 140,
  label,
}: {
  data: { key: string; value: number; tick: string; tip: string; highlight?: boolean }[]
  height?: number
  label: string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <figure aria-label={label}>
      <div className="relative flex items-end gap-[2px] border-b border-rule-strong" style={{ height }}>
        {/* recessive gridline at the halfway mark */}
        <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-rule" style={{ bottom: height / 2 }} />
        {data.map((d) => (
          <div key={d.key} tabIndex={0} className="group relative flex h-full flex-1 items-end justify-center outline-none">
            <div
              className={clsx(
                'w-full max-w-7 rounded-t-[4px] transition-[height] duration-500',
                d.highlight ? 'bg-pen' : 'bg-[color-mix(in_srgb,var(--color-pen)_55%,var(--color-sheet))]',
              )}
              style={{ height: d.value ? Math.max(3, (d.value / max) * (height - 4)) : 0 }}
            />
            <Tip>{d.tip}</Tip>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px]">
        {data.map((d) => (
          <span key={d.key} className={clsx('flex-1 text-center text-2xs', d.highlight ? 'font-bold text-ink' : 'text-ink-faint')}>
            {d.tick}
          </span>
        ))}
      </div>
    </figure>
  )
}

/** Horizontal labeled bars (one per course). `swatch` is a small identity chip; the label carries the meaning. */
export function BarList({
  rows,
  label,
}: {
  rows: { key: string; label: string; swatch?: string; value: number; display: string }[]
  label: string
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <figure aria-label={label} className="space-y-2">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3">
          <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
            {r.swatch && <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: r.swatch }} aria-hidden />}
            {r.label}
          </span>
          <div tabIndex={0} className="group relative h-3 outline-none">
            <div
              className="h-full rounded-r-[4px] bg-pen transition-[width] duration-500"
              style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }}
            />
            <Tip side="right">{r.display}</Tip>
          </div>
          <span className="w-14 text-right text-sm text-ink-soft tabular-nums">{r.display}</span>
        </div>
      ))}
    </figure>
  )
}

/** Planned vs done per week: the planned count is a light track, done fills it. */
export function PlanDoneColumns({
  data,
  height = 120,
  label,
  legend,
}: {
  data: { key: string; planned: number; done: number; tick: string; tip: string }[]
  height?: number
  label: string
  legend: { planned: string; done: string }
}) {
  const max = Math.max(1, ...data.map((d) => d.planned))
  return (
    <figure aria-label={label}>
      <div className="mb-2 flex gap-4 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-[color-mix(in_srgb,var(--color-pen)_22%,var(--color-sheet))] ring-1 ring-pen/40" />
          {legend.planned}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-pen" />
          {legend.done}
        </span>
      </div>
      <div className="flex items-end gap-[6px] border-b border-rule-strong" style={{ height }}>
        {data.map((d) => (
          <div key={d.key} tabIndex={0} className="group relative flex h-full flex-1 items-end justify-center outline-none">
            <div
              className="relative w-full max-w-9 overflow-hidden rounded-t-[4px] bg-[color-mix(in_srgb,var(--color-pen)_22%,var(--color-sheet))]"
              style={{ height: d.planned ? (d.planned / max) * (height - 4) : 0 }}
            >
              <div className="absolute inset-x-0 bottom-0 bg-pen" style={{ height: d.planned ? `${(d.done / d.planned) * 100}%` : 0 }} />
            </div>
            <Tip>{d.tip}</Tip>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[6px]">
        {data.map((d) => (
          <span key={d.key} className="flex-1 text-center text-2xs text-ink-faint">
            {d.tick}
          </span>
        ))}
      </div>
    </figure>
  )
}

/** Sequential steps for topic levels: one hue, light → dark (dark mode: dim → bright). */
export const LEVEL_FILLS = [
  'var(--color-rule-strong)',
  'light-dark(#c3cdf6, #2d3a6b)',
  'light-dark(#7b90ea, #5d75d9)',
  'light-dark(#2440c4, #aebcff)',
]

/** One 100% stacked bar per course, split by topic level. */
export function LevelBars({
  rows,
  levels,
  label,
}: {
  rows: { key: string; label: string; swatch?: string; counts: number[] }[]
  levels: string[]
  label: string
}) {
  return (
    <figure aria-label={label}>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        {levels.map((l, i) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: LEVEL_FILLS[i] }} />
            {l}
          </span>
        ))}
      </div>
      <div className="space-y-2">
        {rows.map((r) => {
          const total = r.counts.reduce((a, b) => a + b, 0)
          return (
            <div key={r.key} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3">
              <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                {r.swatch && <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: r.swatch }} aria-hidden />}
                {r.label}
              </span>
              <div className="flex h-3 gap-[2px]">
                {r.counts.map((n, i) =>
                  n ? (
                    <div
                      key={i}
                      tabIndex={0}
                      className="group relative h-full outline-none first:rounded-l-[4px] last:rounded-r-[4px]"
                      style={{ width: `${(n / total) * 100}%`, background: LEVEL_FILLS[i] }}
                    >
                      <Tip>
                        {levels[i]}: {n}
                      </Tip>
                    </div>
                  ) : null,
                )}
              </div>
              <span className="w-14 text-right text-sm text-ink-soft tabular-nums">{total}</span>
            </div>
          )
        })}
      </div>
    </figure>
  )
}
