import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { CalendarPlus, Pencil } from 'lucide-react'
import { Suspense, lazy, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { BlockDialog, type BlockDraft } from '../components/BlockDialog'
import { Links } from '../components/course/Links'
import { Projects } from '../components/course/Projects'
import { Timetable } from '../components/course/Timetable'
import { Todos } from '../components/course/Todos'
import { Topics } from '../components/course/Topics'
import { Dialog, Label, Section, Segmented } from '../components/ui'
import { HUES, hueVars, swatch } from '../lib/hues'
import { useT } from '../lib/i18n'
import { dayIndex, daysUntil, range, weekKey } from '../lib/time'
import { usePlanner } from '../store'
import type { Course, HueKey } from '../types'

export default function CoursePage() {
  const { t } = useT()
  const { id } = useParams()
  const course = usePlanner((s) => s.courses.find((c) => c.id === id))
  const [draft, setDraft] = useState<BlockDraft | null>(null)
  const [editing, setEditing] = useState(false)

  if (!course)
    return (
      <div className="px-8 py-16">
        <p className="text-lg">{t('notFound')}</p>
        <Link to="/" className="btn btn-primary mt-4">
          {t('backToWeek')}
        </Link>
      </div>
    )

  const plan = (title: string) => {
    const today = dayIndex(new Date())
    setDraft({ courseId: course.id, title, day: today, start: 15 * 60, end: 16 * 60 + 30, repeat: 'once' })
  }

  return (
    <div style={hueVars(course.hue)} className="mx-auto max-w-[80rem] px-4 pt-8 pb-20 sm:px-8">
      <CourseHeader course={course} onEdit={() => setEditing(true)} />

      <div className="mt-8 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <div className="min-w-0 space-y-10">
          <Todos course={course} onPlan={plan} />
          <Projects course={course} />
          <Notes course={course} />
        </div>
        <aside className="space-y-10">
          <StudyBlocks course={course} onPlan={() => plan('')} onOpen={setDraft} />
          <Timetable course={course} />
          <Topics course={course} />
          <Links course={course} />
        </aside>
      </div>

      <BlockDialog draft={draft} week={weekKey(new Date())} onClose={() => setDraft(null)} />
      <DetailsDialog course={course} open={editing} onClose={() => setEditing(false)} />
    </div>
  )
}

function CourseHeader({ course, onEdit }: { course: Course; onEdit: () => void }) {
  const { t, fmt, lang } = useT()
  const left = course.examDate ? daysUntil(course.examDate) : null
  const countdown =
    left === null || left < 0 ? '' : left === 0 ? t('isToday') : left === 1 ? t('inOneDay') : t('inDays', { n: left })
  const facts = [
    course.professor && { k: t('professor'), v: course.professor },
    course.credits && { k: t('credits'), v: `${course.credits} CFU` },
    course.examDate && { k: t('exam'), v: `${fmt(parseISO(course.examDate), 'd MMMM yyyy')}${countdown}` },
    course.examFormat && { k: t('format'), v: course.examFormat },
  ].filter(Boolean) as { k: string; v: string }[]
  const missing = [
    !course.professor && t('missingProfessor'),
    !course.credits && t('missingCredits'),
    !course.examDate && t('missingExamDate'),
    !course.examFormat && t('missingExamFormat'),
  ].filter(Boolean)

  return (
    <header className="max-w-4xl">
      <div className="flex flex-col-reverse items-start gap-2 sm:flex-row sm:gap-4">
        <h1 className="flex flex-1 items-start gap-3 text-3xl leading-[1.15] font-semibold tracking-tight sm:text-[2.4rem]">
          <span className="course-block mt-2.5 size-4 shrink-0 rounded-full sm:mt-3.5" aria-hidden />
          {course.name}
        </h1>
        <button className="btn btn-quiet shrink-0 max-sm:-ml-3 sm:mt-2" onClick={onEdit}>
          <Pencil size={15} /> {t('editDetails')}
        </button>
      </div>
      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <dt className="text-xs text-ink-faint">{t('onWeekAs')}</dt>
          <dd className="font-bold text-[var(--ink)]">{course.short}</dd>
        </div>
        {facts.map((f) => (
          <div key={f.k}>
            <dt className="text-xs text-ink-faint">{f.k}</dt>
            <dd>{f.v}</dd>
          </div>
        ))}
        {missing.length > 0 && (
          <button onClick={onEdit} className="self-end text-sm font-semibold text-pen hover:underline">
            {capitalize(t('addMissing', { list: missing.slice(0, 3).join(', ') }), lang)}
          </button>
        )}
      </dl>
    </header>
  )
}

const Markdown = lazy(() => import('../components/Markdown'))

const capitalize = (s: string, lang: string) => s.charAt(0).toLocaleUpperCase(lang) + s.slice(1)

function Notes({ course }: { course: Course }) {
  const { t } = useT()
  const updateCourse = usePlanner((s) => s.updateCourse)
  const [mode, setMode] = useState<'write' | 'preview'>(course.notes.trim() ? 'preview' : 'write')
  return (
    <Section
      title={t('notes')}
      aside={
        <Segmented
          label={t('notes')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'write', label: t('write') },
            { value: 'preview', label: t('preview') },
          ]}
        />
      }
    >
      {mode === 'write' ? (
        <>
          <textarea
            autoFocus={!!course.notes}
            value={course.notes}
            onChange={(e) => updateCourse(course.id, { notes: e.target.value })}
            placeholder={t('notesPlaceholder')}
            aria-label={t('notesFor', { name: course.name })}
            className="field field-sizing-content block min-h-56 resize-y px-4 py-3 text-[15px] leading-relaxed"
          />
          <p className="mt-2 text-xs text-ink-soft">
            {t('notesHint')} {t('savedAsYouType')}.
          </p>
        </>
      ) : (
        <div
          className="min-h-24 cursor-text rounded-[10px] border border-rule-strong bg-raised px-4 py-3"
          onDoubleClick={() => setMode('write')}
          title={t('edit')}
        >
          {course.notes.trim() ? (
            <Suspense fallback={<p className="text-ink-faint">…</p>}>
              <Markdown>{course.notes}</Markdown>
            </Suspense>
          ) : (
            <p className="text-ink-faint">{t('notesEmpty')}</p>
          )}
        </div>
      )}
    </Section>
  )
}

function StudyBlocks({
  course,
  onPlan,
  onOpen,
}: {
  course: Course
  onPlan: () => void
  onOpen: (d: BlockDraft) => void
}) {
  const { t, days, hours } = useT()
  const all = usePlanner((s) => s.blocks)
  const week = weekKey(new Date())
  const blocks = useMemo(
    () =>
      all
        .filter((b) => b.courseId === course.id && (b.repeat === 'weekly' ? b.week <= week : b.week === week))
        .sort((a, b) => a.day - b.day || a.start - b.start),
    [all, course.id, week],
  )
  const minutes = blocks.reduce((n, b) => n + b.end - b.start, 0)

  return (
    <Section title={t('studyBlocks')} aside={blocks.length > 0 && t('hoursThisWeek', { h: hours(minutes) })}>
      {blocks.length === 0 ? (
        <p className="text-sm text-ink-soft">{t('noStudyTime', { short: course.short })}</p>
      ) : (
        <ul className="space-y-1">
          {blocks.map((b) => (
            <li key={b.id}>
              <button onClick={() => onOpen(b)} className="flex w-full items-baseline gap-2 rounded-md py-1 text-left text-sm hover:bg-pen-soft">
                <span className="w-9 shrink-0 font-semibold">{days[b.day]}</span>
                <span className="w-[5.5rem] shrink-0 text-ink-soft">{range(b.start, b.end)}</span>
                <span className="min-w-0 flex-1 truncate">{b.title}</span>
                {b.repeat === 'weekly' && <span className="text-xs text-ink-faint">{t('weekly')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="btn btn-quiet mt-1 -ml-3 text-pen" onClick={onPlan}>
        <CalendarPlus size={16} /> {t('planBlock')}
      </button>
    </Section>
  )
}

function DetailsDialog({ course, open, onClose }: { course: Course; open: boolean; onClose: () => void }) {
  const { t } = useT()
  return (
    <Dialog open={open} onClose={onClose} title={t('courseDetails')} wide>
      <DetailsForm course={course} onClose={onClose} />
    </Dialog>
  )
}

function DetailsForm({ course, onClose }: { course: Course; onClose: () => void }) {
  const { t, hueName } = useT()
  const updateCourse = usePlanner((s) => s.updateCourse)
  const [f, setF] = useState(course)
  const field = (k: 'name' | 'short' | 'professor' | 'credits' | 'examDate' | 'examFormat') => ({
    id: `course-${k}`,
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }),
    className: 'field',
  })

  const save = (e: FormEvent) => {
    e.preventDefault()
    updateCourse(course.id, {
      name: f.name.trim() || course.name,
      short: f.short.trim() || course.short,
      hue: f.hue,
      professor: f.professor.trim(),
      credits: f.credits.trim(),
      examDate: f.examDate,
      examFormat: f.examFormat.trim(),
    })
    onClose()
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <Label htmlFor="course-name">{t('name')}</Label>
        <input {...field('name')} />
      </div>
      <div className="grid grid-cols-[8rem_1fr] gap-3">
        <div>
          <Label htmlFor="course-short">{t('shortName')}</Label>
          <input {...field('short')} maxLength={8} />
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-ink-soft">{t('highlighter')}</legend>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(Object.keys(HUES) as HueKey[]).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setF({ ...f, hue: h })}
                aria-label={hueName(h)}
                aria-pressed={f.hue === h}
                className={clsx(
                  'size-7 rounded-md border-2 transition-transform',
                  f.hue === h ? 'scale-110 border-ink' : 'border-transparent',
                )}
                style={{ background: swatch(h) }}
              />
            ))}
          </div>
        </fieldset>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="course-professor">{t('professor')}</Label>
          <input {...field('professor')} />
        </div>
        <div>
          <Label htmlFor="course-credits">{t('creditsCfu')}</Label>
          <input {...field('credits')} inputMode="numeric" />
        </div>
        <div>
          <Label htmlFor="course-examDate">{t('examDate')}</Label>
          <input {...field('examDate')} type="date" />
        </div>
        <div>
          <Label htmlFor="course-examFormat">{t('examFormat')}</Label>
          <input {...field('examFormat')} placeholder={t('examFormatPlaceholder')} />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-rule pt-4">
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          {t('cancel')}
        </button>
        <button className="btn btn-primary">{t('saveDetails')}</button>
      </div>
    </form>
  )
}
