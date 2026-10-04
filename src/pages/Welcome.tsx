import clsx from 'clsx'
import { ImageUp, LoaderCircle, Plus, RefreshCw, Smartphone, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { PrefSwitches } from '../components/Layout'
import { kindOptions } from '../components/SlotDialog'
import { Label } from '../components/ui'
import { SEED_COURSES, SEED_SLOTS, TEMPLATE_PROFILE } from '../data/seed'
import { HUES, swatch } from '../lib/hues'
import { useT } from '../lib/i18n'
import { uid } from '../lib/id'
import { useUI } from '../lib/ui'
import { usePlanner } from '../store'
import type { Course, HueKey, Profile, Slot, SlotKind } from '../types'

interface DraftCourse {
  id: string
  name: string
  short: string
  hue: HueKey
}
interface DraftSlot {
  id: string
  courseId: string
  day: number
  start: number
  end: number
  kind: SlotKind
}

const HUE_ORDER: HueKey[] = ['yellow', 'cyan', 'orange', 'pink', 'slate', 'green', 'violet']
const toInput = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const fromInput = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN
}
const shortFrom = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w.length > 3 || /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 5) || name.slice(0, 4).toUpperCase()

/** Shrink big screenshots so the upload stays small; text stays readable at 2000px. */
async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.92)
}

interface ParsedTimetable {
  courses: { name: string; short: string }[]
  slots: { course: string; day: number; start: string; end: string; kind: SlotKind }[]
  note: string
}

export default function Welcome() {
  const T = useT()
  const { t } = T
  const navigate = useNavigate()
  const onboarded = usePlanner((s) => s.onboarded)
  const finishOnboarding = usePlanner((s) => s.finishOnboarding)
  const openSync = useUI((s) => s.openSync)

  const [step, setStep] = useState(1)
  const [profile, setProfile] = useState<Profile>({ name: '', university: '', program: '', semesterStart: '' })
  const [image, setImage] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [note, setNote] = useState('')
  const [courses, setCourses] = useState<DraftCourse[]>([])
  const [slots, setSlots] = useState<DraftSlot[]>([])
  const [finishError, setFinishError] = useState('')

  if (onboarded) return <Navigate to="/" replace />

  const useTemplate = () => {
    setCourses(SEED_COURSES.map(({ id, name, short, hue }) => ({ id, name, short, hue })))
    setSlots(SEED_SLOTS.map(({ id, courseId, day, start, end, kind }) => ({ id, courseId, day, start, end, kind })))
    setProfile((p) => ({
      ...p,
      university: p.university || TEMPLATE_PROFILE.university,
      program: p.program || TEMPLATE_PROFILE.program,
      semesterStart: p.semesterStart || TEMPLATE_PROFILE.semesterStart,
    }))
    setNote('')
    setStep(3)
  }

  const read = async () => {
    setParsing(true)
    setParseError('')
    try {
      const res = await fetch('/api/parse-timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, program: profile.program }),
      })
      const body = (await res.json().catch(() => ({}))) as Partial<ParsedTimetable> & { error?: string }
      if (!res.ok) {
        setParseError(body.error === 'missing_key' ? t('parseMissingKey') : t('parseFailed', { error: body.error ?? res.status }))
        return
      }
      const draftCourses: DraftCourse[] = (body.courses ?? []).map((c, i) => ({
        id: uid(),
        name: c.name.trim(),
        short: (c.short || shortFrom(c.name)).trim().slice(0, 8),
        hue: HUE_ORDER[i % HUE_ORDER.length],
      }))
      const byName = (name: string) => draftCourses.find((c) => c.name.toLowerCase() === name.trim().toLowerCase())
      const draftSlots: DraftSlot[] = []
      for (const s of body.slots ?? []) {
        let course = byName(s.course)
        if (!course) {
          course = { id: uid(), name: s.course.trim(), short: shortFrom(s.course), hue: HUE_ORDER[draftCourses.length % HUE_ORDER.length] }
          draftCourses.push(course)
        }
        const start = fromInput(s.start)
        const end = fromInput(s.end)
        if (!(end > start) || s.day < 0 || s.day > 6) continue
        draftSlots.push({ id: uid(), courseId: course.id, day: s.day, start, end, kind: s.kind })
      }
      if (draftSlots.length === 0 && draftCourses.length === 0) {
        setParseError(t('parseEmpty'))
        return
      }
      setCourses(draftCourses)
      setSlots(draftSlots)
      setNote(body.note ?? '')
      setStep(3)
    } catch (e) {
      setParseError(t('parseFailed', { error: (e as Error).message }))
    } finally {
      setParsing(false)
    }
  }

  const finish = () => {
    if (courses.length === 0) return setFinishError(t('needOneCourse'))
    const fullCourses: Course[] = courses.map((c) => ({
      ...c,
      name: c.name.trim() || c.short,
      short: c.short.trim() || shortFrom(c.name),
      professor: '',
      credits: '',
      examDate: '',
      examFormat: '',
      notes: '',
      links: [],
    }))
    const ids = new Set(courses.map((c) => c.id))
    const fullSlots: Slot[] = slots
      .filter((s) => ids.has(s.courseId) && s.end > s.start)
      .map((s) => ({ ...s, room: '', attending: true }))
    finishOnboarding({ ...profile, name: profile.name.trim(), program: profile.program.trim() }, fullCourses, fullSlots)
    navigate('/', { replace: true })
  }

  const steps = [t('stepAbout'), t('stepTimetable'), t('stepCheck')]

  return (
    <div className="min-h-dvh px-4 py-6 sm:px-8">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="size-8 rounded-lg ring-1 ring-rule-strong" />
          <span className="font-bold">{t('appName')}</span>
        </div>
        <PrefSwitches />
      </header>

      <main className={clsx('mx-auto mt-10', step === 3 ? 'max-w-5xl' : 'max-w-xl')}>
        <h1 className="text-4xl leading-tight font-bold tracking-tight text-balance" style={{ '--hl': 'var(--color-mark)' } as React.CSSProperties}>
          <span className="marker">{t('welcomeTitle')}</span>
        </h1>
        <p className="mt-2 text-ink-soft">{t('welcomeIntro')}</p>

        <ol className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {steps.map((label, i) => (
            <li key={label} className={clsx('flex items-center gap-2', step === i + 1 ? 'font-bold text-ink' : 'text-ink-faint')}>
              <span
                className={clsx(
                  'grid size-6 place-items-center rounded-full text-xs font-bold',
                  step > i + 1 ? 'bg-pen text-on-pen' : step === i + 1 ? 'border-2 border-pen text-pen' : 'border border-rule-strong',
                )}
              >
                {i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>

        <div className="mt-8">
          {step === 1 && (
            <AboutStep
              profile={profile}
              onChange={setProfile}
              onNext={() => setStep(2)}
              onSync={() => openSync()}
            />
          )}
          {step === 2 && (
            <TimetableStep
              image={image}
              setImage={(img) => {
                setImage(img)
                setParseError('')
              }}
              parsing={parsing}
              error={parseError}
              onRead={read}
              onTemplate={useTemplate}
              onEmpty={() => {
                setCourses([])
                setSlots([])
                setNote('')
                setStep(3)
              }}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <CheckStep
              image={image}
              note={note}
              courses={courses}
              slots={slots}
              setCourses={setCourses}
              setSlots={setSlots}
              error={finishError}
              onBack={() => setStep(2)}
              onFinish={finish}
            />
          )}
        </div>
      </main>
    </div>
  )
}

function AboutStep({
  profile,
  onChange,
  onNext,
  onSync,
}: {
  profile: Profile
  onChange: (p: Profile) => void
  onNext: () => void
  onSync: () => void
}) {
  const { t } = useT()
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...profile, [k]: e.target.value })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onNext()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="w-name">
          {t('yourName')} <span className="font-normal text-ink-faint">{t('optional')}</span>
        </Label>
        <input id="w-name" className="field" value={profile.name} onChange={set('name')} autoComplete="given-name" />
      </div>
      <div>
        <Label htmlFor="w-uni">{t('university')}</Label>
        <input id="w-uni" className="field" value={profile.university} onChange={set('university')} placeholder="Politecnico di Torino" />
      </div>
      <div>
        <Label htmlFor="w-program">{t('program')}</Label>
        <input id="w-program" className="field" value={profile.program} onChange={set('program')} placeholder={t('programPlaceholder')} required />
      </div>
      <div>
        <Label htmlFor="w-start">
          {t('semesterStart')} <span className="font-normal text-ink-faint">{t('optional')}</span>
        </Label>
        <input id="w-start" type="date" className="field w-auto" value={profile.semesterStart} onChange={set('semesterStart')} />
        <p className="mt-1 text-xs text-ink-soft">{t('semesterStartHint')}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button type="button" onClick={onSync} className="inline-flex items-center gap-1.5 text-sm font-semibold text-pen hover:underline">
          <Smartphone size={15} /> {t('haveSyncCode')}
        </button>
        <button className="btn btn-primary">{t('next')}</button>
      </div>
    </form>
  )
}

function TimetableStep({
  image,
  setImage,
  parsing,
  error,
  onRead,
  onTemplate,
  onEmpty,
  onBack,
}: {
  image: string
  setImage: (img: string) => void
  parsing: boolean
  error: string
  onRead: () => void
  onTemplate: () => void
  onEmpty: () => void
  onBack: () => void
}) {
  const { t } = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const take = useCallback(
    async (file: File | undefined | null) => {
      if (file && file.type.startsWith('image/')) setImage(await toDataUrl(file))
    },
    [setImage],
  )

  // paste a screenshot straight from the clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (file) take(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [take])

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold">{t('uploadTitle')}</h2>

      {image ? (
        <div>
          <img src={image} alt={t('yourScreenshot')} className="max-h-80 w-full rounded-xl border border-rule-strong object-contain" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={onRead} disabled={parsing}>
              {parsing ? <LoaderCircle size={16} className="animate-spin" /> : <ImageUp size={16} />} {t('readTimetable')}
            </button>
            <button className="btn btn-quiet" onClick={() => inputRef.current?.click()} disabled={parsing}>
              <RefreshCw size={15} /> {t('changeImage')}
            </button>
          </div>
          {parsing && <p className="mt-2 text-sm text-ink-soft" role="status">{t('reading')}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            take(e.dataTransfer.files[0])
          }}
          className={clsx(
            'quadretti flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
            over ? 'border-pen' : 'border-rule-strong hover:border-pen',
          )}
          style={{ '--hour': '56px' } as React.CSSProperties}
        >
          <ImageUp size={28} className="text-pen" />
          <span className="font-semibold">{t('uploadTitle')}</span>
          <span className="text-sm text-ink-soft">{t('uploadHint')}</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} />

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 text-sm text-ink-faint">
        <span className="h-px flex-1 bg-rule" /> {t('orWord')} <span className="h-px flex-1 bg-rule" />
      </div>
      <div className="flex flex-col items-start gap-2">
        <button className="btn btn-quiet -ml-3 text-pen" onClick={onTemplate}>
          {t('useTemplate')}
        </button>
        <button className="btn btn-quiet -ml-3" onClick={onEmpty}>
          {t('startEmpty')}
        </button>
      </div>
      <div className="border-t border-rule pt-4">
        <button className="btn btn-quiet -ml-3" onClick={onBack}>
          {t('back')}
        </button>
      </div>
    </div>
  )
}

function CheckStep({
  image,
  note,
  courses,
  slots,
  setCourses,
  setSlots,
  error,
  onBack,
  onFinish,
}: {
  image: string
  note: string
  courses: DraftCourse[]
  slots: DraftSlot[]
  setCourses: (c: DraftCourse[]) => void
  setSlots: (s: DraftSlot[]) => void
  error: string
  onBack: () => void
  onFinish: () => void
}) {
  const T = useT()
  const { t } = T
  const sorted = [...slots].sort((a, b) => a.day - b.day || a.start - b.start)
  const patchCourse = (id: string, p: Partial<DraftCourse>) => setCourses(courses.map((c) => (c.id === id ? { ...c, ...p } : c)))
  const patchSlot = (id: string, p: Partial<DraftSlot>) => setSlots(slots.map((s) => (s.id === id ? { ...s, ...p } : s)))
  const nextHue = (h: HueKey) => (Object.keys(HUES) as HueKey[])[((Object.keys(HUES) as HueKey[]).indexOf(h) + 1) % 7]

  return (
    <div className={clsx('grid gap-8', image && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
      {image && (
        <figure className="lg:sticky lg:top-6 lg:self-start">
          <img src={image} alt={t('yourScreenshot')} className="w-full rounded-xl border border-rule-strong" />
          <figcaption className="mt-1 text-xs text-ink-soft">{t('yourScreenshot')}</figcaption>
        </figure>
      )}

      <div className="min-w-0 space-y-8">
        <div>
          <p className="text-ink-soft">{t('checkIntro')}</p>
          {(courses.length > 0 || slots.length > 0) && (
            <p className="mt-1 text-sm font-semibold">{t('foundSummary', { courses: courses.length, slots: slots.length })}</p>
          )}
          {note && <p className="mt-2 rounded-lg bg-pen-soft px-3 py-2 text-sm">{t('aiNote', { note })}</p>}
        </div>

        <section>
          <h2 className="mb-2 text-lg font-bold">{t('courses')}</h2>
          <ul className="space-y-2">
            {courses.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => patchCourse(c.id, { hue: nextHue(c.hue) })}
                  className="size-8 shrink-0 rounded-md ring-1 ring-rule-strong"
                  style={{ background: swatch(c.hue) }}
                  aria-label={t('changeColor')}
                  title={t('changeColor')}
                />
                <input className="field min-w-0 flex-1" value={c.name} onChange={(e) => patchCourse(c.id, { name: e.target.value })} aria-label={t('courseName')} placeholder={t('courseName')} />
                <input className="field w-20 font-bold" value={c.short} maxLength={8} onChange={(e) => patchCourse(c.id, { short: e.target.value })} aria-label={t('shortName')} />
                <button
                  className="btn btn-danger p-1.5"
                  onClick={() => {
                    setCourses(courses.filter((x) => x.id !== c.id))
                    setSlots(slots.filter((s) => s.courseId !== c.id))
                  }}
                  aria-label={t('removeNamed', { name: c.name })}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
          <button
            className="btn btn-quiet mt-2 -ml-3 text-pen"
            onClick={() => setCourses([...courses, { id: uid(), name: '', short: '', hue: HUE_ORDER[courses.length % HUE_ORDER.length] }])}
          >
            <Plus size={16} /> {t('addCourse')}
          </button>
        </section>

        {courses.length > 0 && (
          <section>
            <h2 className="mb-2 text-lg font-bold">{t('classTimes')}</h2>
            {sorted.length === 0 && <p className="text-sm text-ink-soft">{t('noClassesYet')}</p>}
            <ul className="space-y-2">
              {sorted.map((s) => (
                <li key={s.id} className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_8.5rem_6.5rem_6.5rem_minmax(0,1fr)_auto]">
                  <select className="field" value={s.courseId} onChange={(e) => patchSlot(s.id, { courseId: e.target.value })} aria-label={t('course')}>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.short || c.name}
                      </option>
                    ))}
                  </select>
                  <select className="field" value={s.day} onChange={(e) => patchSlot(s.id, { day: Number(e.target.value) })} aria-label={t('day')}>
                    {T.daysLong.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <input type="time" step={900} className="field" value={toInput(s.start)} onChange={(e) => patchSlot(s.id, { start: fromInput(e.target.value) })} aria-label={t('from')} />
                  <input type="time" step={900} className="field" value={toInput(s.end)} onChange={(e) => patchSlot(s.id, { end: fromInput(e.target.value) })} aria-label={t('to')} />
                  <select className="field" value={s.kind} onChange={(e) => patchSlot(s.id, { kind: e.target.value as SlotKind })} aria-label={t('type')}>
                    {kindOptions(T).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-danger justify-self-start p-1.5" onClick={() => setSlots(slots.filter((x) => x.id !== s.id))} aria-label={t('delete')}>
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
            <button
              className="btn btn-quiet mt-2 -ml-3 text-pen"
              onClick={() => setSlots([...slots, { id: uid(), courseId: courses[0].id, day: 0, start: 9 * 60, end: 10 * 60 + 30, kind: 'lecture' }])}
            >
              <Plus size={16} /> {t('addClassTime')}
            </button>
          </section>
        )}

        {error && (
          <p className="text-sm font-semibold text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between border-t border-rule pt-4">
          <button className="btn btn-quiet -ml-3" onClick={onBack}>
            {t('back')}
          </button>
          <button className="btn btn-primary" onClick={onFinish}>
            {t('finish')}
          </button>
        </div>
      </div>
    </div>
  )
}
