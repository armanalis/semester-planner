import clsx from 'clsx'
import { addWeeks, differenceInCalendarDays, isSameMonth, isSameWeek, parseISO } from 'date-fns'
import { BrainCircuit, CalendarPlus, ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router'
import { BlockDialog, type BlockDraft } from '../components/BlockDialog'
import { SlotDialog } from '../components/SlotDialog'
import { useDueTopics } from '../components/TopicReview'
import { Meter } from '../components/ui'
import { WeekCalendar, type Deadline } from '../components/WeekCalendar'
import { hueVars } from '../lib/hues'
import { readInvite } from '../lib/ics'
import { useT, type T } from '../lib/i18n'
import { dayIndex, hm, isoDay, minutesNow, mondayOf, weekDates, weekKey } from '../lib/time'
import { useUI } from '../lib/ui'
import { blocksForWeek, isAttending, usePlanner } from '../store'
import type { Course } from '../types'

export default function Planner() {
  const T = useT()
  const { t } = T
  const navigate = useNavigate()
  const { courses, slots, blocks, done, skips, tasks, projects, prefs, profile } = usePlanner()
  const { setPref, toggleDone, updateBlock } = usePlanner.getState()
  const dueTopics = useDueTopics().length
  const openReview = useUI((s) => s.setReviewOpen)

  const [monday, setMonday] = useState(() => mondayOf(new Date()))
  const [draft, setDraft] = useState<BlockDraft | null>(null)
  const [slotId, setSlotId] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState('')
  const [dropping, setDropping] = useState(false)
  const inviteRef = useRef<HTMLInputElement>(null)

  const week = weekKey(monday)
  const isThisWeek = isSameWeek(monday, new Date(), { weekStartsOn: 1 })
  const days = prefs.showWeekend ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4]
  const semesterWeek = profile.semesterStart
    ? Math.floor(differenceInCalendarDays(monday, parseISO(profile.semesterStart)) / 7) + 1
    : 0

  const weekBlocks = useMemo(() => blocksForWeek(blocks, week), [blocks, week])
  const visibleSlots = useMemo(
    () => slots.filter((s) => prefs.showSkipped || isAttending(s, skips, week)),
    [slots, skips, week, prefs.showSkipped],
  )
  const doneCount = weekBlocks.filter((b) => done[`${b.id}|${week}`]).length

  const deadlines = useMemo(() => {
    const dates = weekDates(monday).map(isoDay)
    return dates.map((iso, d) => {
      const list: Deadline[] = []
      for (const c of courses)
        if (c.examDate === iso)
          list.push({ key: `exam-${c.id}`, courseId: c.id, label: t('examOf', { short: c.short }), strong: true })
      for (const p of projects)
        if (p.due === iso) list.push({ key: `p-${p.id}`, courseId: p.courseId, label: p.title, strong: true })
      for (const x of tasks)
        if (!x.done && x.due === iso) list.push({ key: `t-${x.id}-${d}`, courseId: x.courseId, label: x.title })
      return list
    })
  }, [monday, courses, projects, tasks, t])

  const lastCourse = blocks.at(-1)?.courseId ?? courses[0]?.id

  /** Opens the block dialog on the invite's week, filled in from the .ics file, so it can be checked before saving. */
  const importInvite = async (file: File) => {
    const invite = readInvite(await file.text())
    if (!invite) return setInviteError(t('inviteUnreadable', { file: file.name }))
    setInviteError('')
    const { start, end } = invite
    const from = invite.allDay ? 9 * 60 : start.getHours() * 60 + start.getMinutes()
    const to = invite.allDay ? from + 60 : isoDay(end) === isoDay(start) ? end.getHours() * 60 + end.getMinutes() : 24 * 60
    const words = invite.title.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    const course = courses.find((c) => words.includes(c.short.toLowerCase()) || invite.title.toLowerCase().includes(c.name.toLowerCase()))
    const day = dayIndex(start)
    if (day >= 5 && !prefs.showWeekend) setPref('showWeekend', true)
    setMonday(mondayOf(start))
    setDraft({
      courseId: course?.id ?? lastCourse,
      day,
      start: from,
      end: to > from ? to : from + 60,
      title: [invite.title, invite.location.split('\n')[0]].filter(Boolean).join(' · '),
      repeat: invite.weekly ? 'weekly' : 'once',
    })
  }

  const isFileDrag = (e: DragEvent) => e.dataTransfer.types.includes('Files')

  return (
    <div
      className="relative px-4 pt-6 pb-16 sm:px-8"
      onDragOver={(e) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        setDropping(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        setDropping(false)
        const file = e.dataTransfer.files[0]
        if (file) importInvite(file)
      }}
    >
      {dropping && (
        <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-pen bg-pen-soft/80 text-lg font-semibold text-pen">
          <CalendarPlus size={22} className="mr-2" /> {t('dropInvite')}
        </div>
      )}
      <header className="mb-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{weekTitle(monday, T)}</h1>
            <div className="flex items-center">
              <button className="btn btn-quiet p-1.5" aria-label={t('prevWeek')} onClick={() => setMonday((m) => addWeeks(m, -1))}>
                <ChevronLeft size={20} />
              </button>
              <button
                className={clsx('btn px-2.5 py-1 whitespace-nowrap', isThisWeek ? 'text-ink-faint' : 'btn-quiet text-pen')}
                disabled={isThisWeek}
                onClick={() => setMonday(mondayOf(new Date()))}
              >
                {t('thisWeek')}
              </button>
              <button className="btn btn-quiet p-1.5" aria-label={t('nextWeek')} onClick={() => setMonday((m) => addWeeks(m, 1))}>
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {profile.semesterStart && (
              <p className="text-ink-soft">
                {semesterWeek >= 1 && semesterWeek <= 16 ? t('semesterWeek', { n: semesterWeek }) : t('outsideLectures')}
              </p>
            )}
            {dueTopics > 0 && (
              <button
                onClick={() => openReview(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-pen-soft px-2.5 py-0.5 text-sm font-semibold text-pen hover:bg-pen hover:text-on-pen"
              >
                <BrainCircuit size={15} /> {t(dueTopics === 1 ? 'topicToReview' : 'topicsToReview', { n: dueTopics })}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="w-64">
            {weekBlocks.length > 0 ? (
              <>
                <p className="mb-1.5 text-sm">
                  <span className="font-bold">{t('blocksDoneCount', { done: doneCount, total: weekBlocks.length })}</span>{' '}
                  {t('blocksDoneLabel')}
                </p>
                <Meter value={doneCount} total={weekBlocks.length} />
              </>
            ) : (
              <p className="text-sm text-ink-soft">{t('firstBlockHint')}</p>
            )}
          </div>
          <div className="flex gap-1">
            <Toggle on={prefs.showSkipped} onClick={() => setPref('showSkipped', !prefs.showSkipped)}>
              {prefs.showSkipped ? <Eye size={15} /> : <EyeOff size={15} />} {t('skippedClasses')}
            </Toggle>
            <Toggle on={prefs.showWeekend} onClick={() => setPref('showWeekend', !prefs.showWeekend)}>
              {t('weekend')}
            </Toggle>
            <button
              onClick={() => inviteRef.current?.click()}
              title={t('importInviteHint')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rule-strong px-2.5 py-1 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
            >
              <CalendarPlus size={15} /> {t('importInvite')}
            </button>
            <input
              ref={inviteRef}
              type="file"
              accept=".ics,text/calendar"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) importInvite(file)
                e.target.value = ''
              }}
            />
          </div>
        </div>
      </header>

      {inviteError && (
        <p className="mb-3 text-sm font-semibold text-danger" role="alert">
          {inviteError}
        </p>
      )}

      {isThisWeek && <UpNext courses={courses} />}

      <WeekCalendar
        monday={monday}
        days={days}
        courses={courses}
        slots={visibleSlots}
        blocks={weekBlocks}
        isDone={(id) => !!done[`${id}|${week}`]}
        isSkipped={(s) => !isAttending(s, skips, week)}
        onMoveBlock={(id, day, start, end) => updateBlock(id, { day, start, end })}
        deadlines={deadlines}
        onSlotClick={(s) => setSlotId(s.id)}
        onBlockClick={(b) => setDraft(b)}
        onToggleDone={(b) => toggleDone(b.id, week)}
        onCreate={(day, start, end) => setDraft({ courseId: lastCourse, day, start, end, title: '', repeat: 'weekly' })}
        onDeadlineClick={(d) => navigate(`/course/${d.courseId}`)}
      />

      <BlockDialog draft={draft} week={week} onClose={() => setDraft(null)} />
      <SlotDialog slotId={slotId} week={week} onClose={() => setSlotId(null)} />
    </div>
  )
}

function weekTitle(monday: Date, { fmt }: T) {
  const sunday = weekDates(monday)[6]
  return isSameMonth(monday, sunday)
    ? `${fmt(monday, 'd')}–${fmt(sunday, 'd MMMM')}`
    : `${fmt(monday, 'd MMM')} – ${fmt(sunday, 'd MMM')}`
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm font-semibold transition-colors',
        on ? 'border-pen bg-pen-soft text-pen' : 'border-rule-strong text-ink-soft hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

/** One line telling you what's happening now or next this week. */
function UpNext({ courses }: { courses: Course[] }) {
  const { t, daysLong, kindLower } = useT()
  const { slots, blocks, done, skips } = usePlanner()
  const now = new Date()
  const today = dayIndex(now)
  const nowM = minutesNow(now)
  const week = weekKey(now)
  const byId = Object.fromEntries(courses.map((c) => [c.id, c]))

  const items = [
    ...slots
      .filter((s) => isAttending(s, skips, week))
      .map((s) => ({
        day: s.day,
        start: s.start,
        end: s.end,
        courseId: s.courseId,
        what: `${byId[s.courseId]?.short} ${kindLower(s.kind)}`,
      })),
    ...blocksForWeek(blocks, week)
      .filter((b) => !done[`${b.id}|${week}`])
      .map((b) => ({ day: b.day, start: b.start, end: b.end, courseId: b.courseId, what: b.title })),
  ].sort((a, b) => a.day - b.day || a.start - b.start)

  const current = items.find((i) => i.day === today && i.start <= nowM && i.end > nowM)
  const next = items.find((i) => i.day > today || (i.day === today && i.start > nowM))
  const shown = current ?? next
  const c = shown && byId[shown.courseId]

  let text: string
  if (current) text = t('upNow', { what: current.what, time: hm(current.end) })
  else if (next)
    text = t('upNext', {
      what: next.what,
      when: next.day === today ? t('today') : daysLong[next.day],
      time: hm(next.start),
    })
  else text = t('nothingElse')

  return (
    <p className="mb-3 flex items-center gap-2 text-[15px]" style={c ? hueVars(c.hue) : undefined}>
      <span className={clsx('size-2.5 rounded-full', c ? 'bg-[var(--ink)]' : 'bg-ink-faint')} aria-hidden />
      <span className={clsx(current && 'font-bold')}>{text}</span>
    </p>
  )
}
