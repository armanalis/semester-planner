import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { usePlanner } from '../store'
import { translator } from './i18n'
import { weekKey } from './time'

export type Phase = 'focus' | 'short' | 'long'

export interface FocusSettings {
  focus: number // minutes
  short: number
  long: number
  rounds: number // focus rounds before a long break
  autoStart: boolean
  sound: boolean
}

interface FocusState {
  settings: FocusSettings
  phase: Phase
  status: 'idle' | 'running' | 'paused'
  /** length of the current phase, fixed when it starts (ms) */
  duration: number
  endsAt: number
  /** ms left while idle or paused */
  remaining: number
  /** focus rounds finished in this cycle */
  round: number
  courseId: string
  blockId: string
  label: string
  startedAt: number
  open: boolean
  /** a study block whose focus session just ended, to offer "mark done" */
  finishedBlock: { blockId: string; week: string; label: string } | null

  setSettings: (patch: Partial<FocusSettings>) => void
  setTarget: (target: { courseId?: string; blockId?: string; label?: string }) => void
  setOpen: (open: boolean) => void
  setPhase: (phase: Phase) => void
  start: () => void
  pause: () => void
  reset: () => void
  skip: () => void
  stopAndSave: () => void
  tick: () => void
  clearFinished: () => void
}

const DEFAULTS: FocusSettings = { focus: 25, short: 5, long: 15, rounds: 4, autoStart: false, sound: true }
/** longest each part can be set to (minutes) */
export const MAX_MINUTES: Record<Phase, number> = { focus: 180, short: 60, long: 90 }
const ms = (min: number) => Math.round(min * 60_000)

export const timeLeft = (s: Pick<FocusState, 'status' | 'endsAt' | 'remaining'>, now = Date.now()) =>
  s.status === 'running' ? Math.max(0, s.endsAt - now) : s.remaining

/** Three soft beeps, made on the fly so there's no audio file to load. */
function beep() {
  try {
    const ctx = new AudioContext()
    ;[0, 0.28, 0.56].forEach((at) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at)
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.22)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + at)
      osc.stop(ctx.currentTime + at + 0.25)
    })
    setTimeout(() => ctx.close(), 1200)
  } catch {
    /* audio not available */
  }
}

function notify(text: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification(text)
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

export const useFocus = create<FocusState>()(
  persist(
    (set, get) => {
      /** Move to `next` phase, running or waiting depending on autoStart. */
      const goTo = (next: Phase, round: number, autoRun: boolean) => {
        const duration = ms(get().settings[next])
        const now = Date.now()
        set({
          phase: next,
          round,
          duration,
          remaining: duration,
          status: autoRun ? 'running' : 'idle',
          endsAt: autoRun ? now + duration : 0,
          startedAt: autoRun ? now : 0,
        })
      }

      const afterFocus = (round: number) => (round % get().settings.rounds === 0 ? 'long' : 'short')

      const logFocus = (minutes: number) => {
        const s = get()
        if (minutes < 1) return
        usePlanner.getState().addSession({
          courseId: s.courseId,
          blockId: s.blockId,
          label: s.label,
          start: s.startedAt || Date.now() - ms(minutes),
          minutes: Math.round(minutes),
        })
        if (s.blockId) set({ finishedBlock: { blockId: s.blockId, week: weekKey(new Date()), label: s.label } })
      }

      return {
        settings: DEFAULTS,
        phase: 'focus',
        status: 'idle',
        duration: ms(DEFAULTS.focus),
        endsAt: 0,
        remaining: ms(DEFAULTS.focus),
        round: 0,
        courseId: '',
        blockId: '',
        label: '',
        startedAt: 0,
        open: false,
        finishedBlock: null,

        setSettings: (patch) => {
          const settings = { ...get().settings, ...patch }
          set({ settings })
          // a waiting timer picks up the new length right away; a running one keeps its current length
          if (get().status === 'idle') {
            const duration = ms(settings[get().phase])
            set({ duration, remaining: duration })
          }
        },
        setTarget: (target) => set((s) => ({ courseId: target.courseId ?? s.courseId, blockId: target.blockId ?? '', label: target.label ?? s.label })),
        setOpen: (open) => set({ open }),
        setPhase: (phase) => goTo(phase, get().round, false),

        start: () => {
          const s = get()
          if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission()
          if (s.status === 'running') return
          const now = Date.now()
          set({ status: 'running', endsAt: now + s.remaining, startedAt: s.status === 'idle' ? now : s.startedAt || now })
        },
        pause: () => {
          const s = get()
          if (s.status !== 'running') return
          set({ status: 'paused', remaining: Math.max(0, s.endsAt - Date.now()) })
        },
        reset: () => {
          const duration = ms(get().settings[get().phase])
          set({ status: 'idle', duration, remaining: duration, endsAt: 0, startedAt: 0 })
        },
        skip: () => {
          const s = get()
          if (s.phase === 'focus') goTo(afterFocus(s.round + 1), s.round + 1, false)
          else goTo('focus', s.phase === 'long' ? 0 : s.round, false)
        },
        stopAndSave: () => {
          const s = get()
          if (s.phase !== 'focus') return
          logFocus((s.duration - timeLeft(s)) / 60_000)
          goTo(afterFocus(s.round + 1), s.round + 1, false)
        },
        tick: () => {
          const s = get()
          if (s.status !== 'running' || Date.now() < s.endsAt) return
          const T = translator(usePlanner.getState().prefs.lang)
          if (s.settings.sound) beep()
          if (s.phase === 'focus') {
            logFocus(s.duration / 60_000)
            notify(T.t('notifFocusDone'))
            goTo(afterFocus(s.round + 1), s.round + 1, s.settings.autoStart)
          } else {
            notify(T.t('notifBreakDone'))
            goTo('focus', s.phase === 'long' ? 0 : s.round, s.settings.autoStart)
          }
        },
        clearFinished: () => set({ finishedBlock: null }),
      }
    },
    {
      name: 'polito-focus',
      partialize: ({ settings, phase, status, duration, endsAt, remaining, round, courseId, blockId, label, startedAt }) => ({
        settings,
        phase,
        status,
        duration,
        endsAt,
        remaining,
        round,
        courseId,
        blockId,
        label,
        startedAt,
      }),
    },
  ),
)
