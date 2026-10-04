import clsx from 'clsx'
import { format } from 'date-fns'
import { BarChart3, CalendarDays, ClipboardCheck, Download, HardDriveDownload, Monitor, MonitorSmartphone, Moon, Sun, Timer, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router'
import { hueVars } from '../lib/hues'
import { useFocus } from '../lib/focus'
import { useT } from '../lib/i18n'
import { useSync } from '../lib/sync'
import { useUI } from '../lib/ui'
import { isoDay } from '../lib/time'
import { pickData, usePlanner, type PlannerData } from '../store'
import type { Lang, Theme } from '../types'
import { Logo } from './Logo'
import { Dialog } from './ui'

const SCHEME: Record<Theme, string> = { system: 'light dark', light: 'light', dark: 'dark' }

/** Theme only flips color-scheme; every color token is light-dark(). */
export function usePrefsOnDocument() {
  const { theme, lang } = usePlanner((s) => s.prefs)
  useEffect(() => {
    document.documentElement.style.colorScheme = SCHEME[theme]
  }, [theme])
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
}

export default function Layout() {
  const onboarded = usePlanner((s) => s.onboarded)
  const [backupOpen, setBackupOpen] = useState(false)
  if (!onboarded) return <Navigate to="/welcome" replace />
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15.5rem_minmax(0,1fr)]">
      <Sidebar onBackup={() => setBackupOpen(true)} />
      <MobileBar />
      <main className="min-w-0">
        <Outlet />
      </main>
      <BackupDialog open={backupOpen} onClose={() => setBackupOpen(false)} />
    </div>
  )
}

function useOpenCounts() {
  const tasks = usePlanner((s) => s.tasks)
  return useMemo(() => {
    const today = isoDay(new Date())
    const counts: Record<string, { open: number; late: number }> = {}
    for (const x of tasks) {
      if (x.done) continue
      counts[x.courseId] ??= { open: 0, late: 0 }
      counts[x.courseId].open++
      if (x.due && x.due < today) counts[x.courseId].late++
    }
    return counts
  }, [tasks])
}

function Brand() {
  const { t } = useT()
  const program = usePlanner((s) => s.profile.program)
  return (
    <div className="flex items-center gap-2.5">
      <Logo />
      <div className="leading-tight">
        <p className="font-bold">{t('appName')}</p>
        <p className="max-w-40 truncate text-xs text-ink-soft">{program || t('appSub')}</p>
      </div>
    </div>
  )
}

/** Theme (light / dark / system) and language (EN / TR) switches. */
export function PrefSwitches({ className }: { className?: string }) {
  const { t } = useT()
  const { theme, lang } = usePlanner((s) => s.prefs)
  const setPref = usePlanner((s) => s.setPref)
  const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: t('themeLight'), icon: Sun },
    { value: 'dark', label: t('themeDark'), icon: Moon },
    { value: 'system', label: t('themeSystem'), icon: Monitor },
  ]
  const langs: { value: Lang; label: string; name: string }[] = [
    { value: 'en', label: 'EN', name: 'English' },
    { value: 'tr', label: 'TR', name: 'Türkçe' },
  ]
  const item = (on: boolean) =>
    clsx(
      'grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-xs font-bold transition-colors',
      on ? 'bg-pen-soft text-pen' : 'text-ink-faint hover:text-ink',
    )

  return (
    <div className={clsx('flex w-fit items-center rounded-lg border border-rule-strong bg-raised p-0.5', className)}>
      <div role="radiogroup" aria-label={t('theme')} className="flex">
        {themes.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            role="radio"
            aria-checked={theme === value}
            aria-label={label}
            title={label}
            onClick={() => setPref('theme', value)}
            className={item(theme === value)}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>
      <span className="mx-1 h-4 w-px bg-rule-strong" aria-hidden />
      <div role="radiogroup" aria-label={t('language')} className="flex">
        {langs.map((l) => (
          <button
            key={l.value}
            role="radio"
            aria-checked={lang === l.value}
            aria-label={l.name}
            title={l.name}
            lang={l.value}
            onClick={() => setPref('lang', l.value)}
            className={item(lang === l.value)}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Sidebar({ onBackup }: { onBackup: () => void }) {
  const { t } = useT()
  const courses = usePlanner((s) => s.courses)
  const counts = useOpenCounts()

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-margin/35 bg-paper px-3 py-5 md:flex">
      <div className="px-2">
        <Brand />
      </div>

      <nav className="mt-7 flex flex-1 flex-col gap-0.5" aria-label="Main">
        {(
          [
            ['/', t('weekPlanner'), CalendarDays],
            ['/review', t('weeklyReview'), ClipboardCheck],
            ['/stats', t('statistics'), BarChart3],
          ] as const
        ).map(([to, label, Icon]) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 rounded-lg px-2 py-1.5 font-semibold transition-colors',
                isActive ? 'bg-pen-soft text-pen' : 'text-ink-soft hover:bg-rule/50 hover:text-ink',
              )
            }
          >
            <Icon size={18} /> {label}
          </NavLink>
        ))}

        <p className="mt-6 mb-1 px-2 text-sm text-ink-faint">{t('courses')}</p>
        {courses.map((c) => {
          const n = counts[c.id]
          return (
            <NavLink
              key={c.id}
              to={`/course/${c.id}`}
              style={hueVars(c.hue)}
              title={c.name}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors',
                  isActive ? 'bg-[color-mix(in_srgb,var(--hl)_55%,var(--color-paper))]' : 'hover:bg-rule/50',
                )
              }
            >
              <span className="highlighter h-6 w-1.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-tight font-bold text-[var(--ink)]">{c.short}</span>
                <span className="block truncate text-xs text-ink-soft">{c.name}</span>
              </span>
              {n && (
                <span
                  className={clsx('text-xs font-semibold', n.late ? 'text-danger' : 'text-ink-soft')}
                  title={t('openTodos', { n: n.open }) + (n.late ? t('lateSuffix', { n: n.late }) : '')}
                >
                  {n.open}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      <FocusButton />
      <SyncButton />
      <button onClick={onBackup} className="btn btn-quiet justify-start">
        <HardDriveDownload size={17} /> {t('backup')}
      </button>
      <PrefSwitches className="mt-2 ml-1" />
    </aside>
  )
}

function FocusButton() {
  const { t } = useT()
  const status = useFocus((s) => s.status)
  const setOpen = useFocus((s) => s.setOpen)
  return (
    <button onClick={() => setOpen(true)} className="btn btn-quiet justify-start">
      <Timer size={17} /> {t('focusTimer')}
      {status === 'running' && <span className="ml-auto size-2 animate-pulse rounded-full bg-margin" aria-hidden />}
    </button>
  )
}

function SyncButton() {
  const { t } = useT()
  const code = useSync((s) => s.code)
  const status = useSync((s) => s.status)
  const openSync = useUI((s) => s.openSync)
  return (
    <button onClick={() => openSync()} className="btn btn-quiet justify-start">
      <MonitorSmartphone size={17} /> {t('sync')}
      <span
        className={clsx(
          'ml-auto size-2 rounded-full',
          !code ? 'bg-rule-strong' : status === 'error' || status === 'offline' ? 'bg-danger' : 'bg-[light-dark(#2f8a3a,#7ddc8a)]',
        )}
        title={code ? t('syncOn') : t('syncOff')}
        aria-hidden
      />
    </button>
  )
}

function MobileBar() {
  const { t } = useT()
  const courses = usePlanner((s) => s.courses)
  const chip = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'shrink-0 rounded-lg px-2.5 py-1 text-sm font-bold',
      isActive ? 'bg-[var(--hl,var(--color-pen-soft))] text-[var(--ink,var(--color-pen))]' : 'text-ink-soft',
    )
  return (
    <div className="sticky top-0 z-30 border-b border-rule-strong bg-paper/95 px-4 pt-3 pb-2 backdrop-blur-sm md:hidden">
      <div className="flex items-center justify-between gap-3">
        <Brand />
        <PrefSwitches />
      </div>
      <nav className="-mx-1 mt-2 flex gap-1 overflow-x-auto" aria-label="Main">
        <NavLink to="/" end className={chip}>
          {t('week')}
        </NavLink>
        <NavLink to="/review" className={chip}>
          {t('reviewChip')}
        </NavLink>
        <NavLink to="/stats" className={chip}>
          {t('statsChip')}
        </NavLink>
        <button className={chip({ isActive: false })} onClick={() => useFocus.getState().setOpen(true)}>
          {t('focusChip')}
        </button>
        <button className={chip({ isActive: false })} onClick={() => useUI.getState().openSync()}>
          {t('sync')}
        </button>
        {courses.map((c) => (
          <NavLink key={c.id} to={`/course/${c.id}`} style={hueVars(c.hue)} className={chip}>
            {c.short}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function BackupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  const download = () => {
    const data = JSON.stringify(pickData(usePlanner.getState()), null, 2)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    a.download = `semester-planner-${format(new Date(), 'yyyy-MM-dd')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setStatus(t('backupDownloaded'))
  }

  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as PlannerData
      if (!Array.isArray(data.courses) || !Array.isArray(data.slots)) throw new Error('not a planner backup')
      usePlanner.getState().importData(data)
      setStatus(t('restored', { file: file.name }))
    } catch {
      setStatus(t('notBackup', { file: file.name }))
    }
  }

  const close = () => {
    setStatus('')
    setConfirmReset(false)
    onClose()
  }

  return (
    <Dialog open={open} onClose={close} title={t('backup')}>
      <p className="text-sm text-ink-soft">{t('backupIntro')}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={download}>
          <Download size={16} /> {t('downloadBackup')}
        </button>
        <button className="btn btn-quiet border border-rule-strong" onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> {t('restore')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) restore(f)
            e.target.value = ''
          }}
        />
      </div>
      {status && (
        <p className="mt-3 text-sm font-semibold" role="status">
          {status}
        </p>
      )}

      <div className="mt-6 border-t border-rule pt-4">
        <p className="text-sm text-ink-soft">{t('resetIntro')}</p>
        <button
          className="btn btn-danger mt-2 -ml-3"
          onClick={() => {
            if (!confirmReset) return setConfirmReset(true)
            usePlanner.getState().resetAll()
            setConfirmReset(false)
            setStatus(t('resetDone'))
          }}
        >
          {confirmReset ? t('resetConfirm') : t('startOver')}
        </button>
      </div>
    </Dialog>
  )
}
