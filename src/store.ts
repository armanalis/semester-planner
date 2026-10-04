import { addDays, format } from 'date-fns'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TEMPLATE_PROFILE } from './data/seed'
import { uid } from './lib/id'
import type {
  Course,
  FocusSession,
  Lang,
  Milestone,
  Profile,
  Project,
  Slot,
  StudyBlock,
  Task,
  Theme,
  Topic,
  TopicLevel,
  WeekReview,
} from './types'

/** Everything that belongs to the student: backed up, exported and synced between devices. */
export interface PlannerData {
  onboarded: boolean
  profile: Profile
  courses: Course[]
  slots: Slot[]
  blocks: StudyBlock[]
  /** `${blockId}|${weekKey}` → done that week */
  done: Record<string, boolean>
  /** `${slotId}|${weekKey}` → skipped that week; value is the catch-up to-do id ('' if none) */
  skips: Record<string, string>
  tasks: Task[]
  projects: Project[]
  topics: Topic[]
  sessions: FocusSession[]
  reviews: Record<string, WeekReview>
}

export const DATA_KEYS = [
  'onboarded',
  'profile',
  'courses',
  'slots',
  'blocks',
  'done',
  'skips',
  'tasks',
  'projects',
  'topics',
  'sessions',
  'reviews',
] as const satisfies readonly (keyof PlannerData)[]

/** Per-device settings, never synced. */
export interface Prefs {
  showSkipped: boolean
  showWeekend: boolean
  lang: Lang
  theme: Theme
}

const detectLang = (): Lang =>
  typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en'

interface PlannerActions {
  prefs: Prefs
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void

  setProfile: (patch: Partial<Profile>) => void
  finishOnboarding: (profile: Profile, courses: Course[], slots: Slot[]) => void

  addCourse: (course: Omit<Course, 'id'>) => string
  updateCourse: (id: string, patch: Partial<Course>) => void
  addLink: (courseId: string, label: string, url: string) => void
  removeLink: (courseId: string, linkId: string) => void

  addSlot: (slot: Omit<Slot, 'id'>) => void
  updateSlot: (id: string, patch: Partial<Slot>) => void
  removeSlot: (id: string) => void
  /** Attend one lab slot of a course and skip its other lab slots. */
  chooseLab: (courseId: string, slotId: string) => void
  /** Skip a class for one week. taskId = the catch-up to-do created for it. */
  skipForWeek: (slotId: string, week: string, taskId: string) => void
  /** Undo a one-week skip; removes the catch-up to-do if it isn't done. */
  unskipForWeek: (slotId: string, week: string) => void

  addBlock: (block: Omit<StudyBlock, 'id'>) => void
  updateBlock: (id: string, patch: Partial<StudyBlock>) => void
  removeBlock: (id: string) => void
  toggleDone: (blockId: string, week: string) => void

  addTask: (courseId: string, title: string, due: string) => string
  updateTask: (id: string, patch: Partial<Task>) => void
  toggleTask: (id: string) => void
  removeTask: (id: string) => void

  addProject: (courseId: string, title: string, due: string) => void
  updateProject: (id: string, patch: Partial<Omit<Project, 'milestones'>>) => void
  removeProject: (id: string) => void
  addMilestone: (projectId: string, title: string) => void
  toggleMilestone: (projectId: string, milestoneId: string) => void
  removeMilestone: (projectId: string, milestoneId: string) => void

  addTopic: (courseId: string, title: string) => void
  setTopicLevel: (id: string, level: TopicLevel) => void
  /** Spaced repetition: 'good' pushes the next review further out, 'again' brings it back tomorrow. */
  reviewTopic: (id: string, result: 'good' | 'again') => void
  removeTopic: (id: string) => void

  addSession: (session: Omit<FocusSession, 'id'>) => void
  removeSession: (id: string) => void

  setReview: (week: string, patch: Partial<WeekReview>) => void

  importData: (data: Partial<PlannerData>) => void
  resetAll: () => void
}


/** Days until the next review after `step` successful reviews in a row. */
export const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60]
const inDays = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd')

const EMPTY_REVIEW: WeekReview = { well: '', hard: '', change: '', doneAt: 0 }
const EMPTY_PROFILE: Profile = { name: '', university: '', program: '', semesterStart: '' }

const initial = (): PlannerData => ({
  onboarded: false,
  profile: EMPTY_PROFILE,
  courses: [],
  slots: [],
  blocks: [],
  done: {},
  skips: {},
  tasks: [],
  projects: [],
  topics: [],
  sessions: [],
  reviews: {},
})

const patchById = <T extends { id: string }>(list: T[], id: string, patch: Partial<T>) =>
  list.map((x) => (x.id === id ? { ...x, ...patch } : x))

const patchMilestones = (
  projects: Project[],
  projectId: string,
  fn: (m: Milestone[]) => Milestone[],
) => projects.map((p) => (p.id === projectId ? { ...p, milestones: fn(p.milestones) } : p))

/** Fill fields that older saves or backups don't have yet. */
function normalize(data: Partial<PlannerData>): PlannerData {
  const base = initial()
  const hasCourses = (data.courses?.length ?? 0) > 0
  return {
    ...base,
    ...data,
    onboarded: data.onboarded ?? hasCourses,
    profile: data.profile ?? (hasCourses ? TEMPLATE_PROFILE : EMPTY_PROFILE),
    topics: (data.topics ?? []).map((t) => ({ ...t, step: t.step ?? 0, due: t.due ?? '' })),
  }
}

export const usePlanner = create<PlannerData & PlannerActions>()(
  persist(
    (set, get) => ({
      ...initial(),
      prefs: { showSkipped: false, showWeekend: true, lang: detectLang(), theme: 'system' },
      setPref: (key, value) => set((s) => ({ prefs: { ...s.prefs, [key]: value } })),

      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      finishOnboarding: (profile, courses, slots) => set({ profile, courses, slots, onboarded: true }),

      addCourse: (course) => {
        const id = uid()
        set((s) => ({ courses: [...s.courses, { ...course, id }] }))
        return id
      },
      updateCourse: (id, patch) => set((s) => ({ courses: patchById(s.courses, id, patch) })),
      addLink: (courseId, label, url) =>
        set((s) => ({
          courses: s.courses.map((c) =>
            c.id === courseId ? { ...c, links: [...c.links, { id: uid(), label, url }] } : c,
          ),
        })),
      removeLink: (courseId, linkId) =>
        set((s) => ({
          courses: s.courses.map((c) =>
            c.id === courseId ? { ...c, links: c.links.filter((l) => l.id !== linkId) } : c,
          ),
        })),

      addSlot: (slot) => set((s) => ({ slots: [...s.slots, { ...slot, id: uid() }] })),
      updateSlot: (id, patch) => set((s) => ({ slots: patchById(s.slots, id, patch) })),
      removeSlot: (id) => set((s) => ({ slots: s.slots.filter((x) => x.id !== id) })),
      chooseLab: (courseId, slotId) =>
        set((s) => ({
          slots: s.slots.map((x) =>
            x.courseId === courseId && x.kind === 'lab' ? { ...x, attending: x.id === slotId } : x,
          ),
        })),
      skipForWeek: (slotId, week, taskId) => set((s) => ({ skips: { ...s.skips, [`${slotId}|${week}`]: taskId } })),
      unskipForWeek: (slotId, week) =>
        set((s) => {
          const key = `${slotId}|${week}`
          const taskId = s.skips[key]
          const skips = { ...s.skips }
          delete skips[key]
          const tasks = taskId ? s.tasks.filter((x) => x.id !== taskId || x.done) : s.tasks
          return { skips, tasks }
        }),

      addBlock: (block) => set((s) => ({ blocks: [...s.blocks, { ...block, id: uid() }] })),
      updateBlock: (id, patch) => set((s) => ({ blocks: patchById(s.blocks, id, patch) })),
      removeBlock: (id) =>
        set((s) => ({
          blocks: s.blocks.filter((b) => b.id !== id),
          done: Object.fromEntries(Object.entries(s.done).filter(([k]) => !k.startsWith(`${id}|`))),
        })),
      toggleDone: (blockId, week) =>
        set((s) => {
          const key = `${blockId}|${week}`
          const done = { ...s.done }
          if (done[key]) delete done[key]
          else done[key] = true
          return { done }
        }),

      addTask: (courseId, title, due) => {
        const id = uid()
        set((s) => ({ tasks: [...s.tasks, { id, courseId, title, due, done: false, createdAt: Date.now() }] }))
        return id
      },
      updateTask: (id, patch) => set((s) => ({ tasks: patchById(s.tasks, id, patch) })),
      toggleTask: (id) => {
        const task = get().tasks.find((x) => x.id === id)
        if (!task) return
        set((s) => ({
          tasks: patchById(s.tasks, id, { done: !task.done, doneAt: task.done ? undefined : Date.now() }),
        }))
      },
      removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((x) => x.id !== id) })),

      addProject: (courseId, title, due) =>
        set((s) => ({ projects: [...s.projects, { id: uid(), courseId, title, due, milestones: [] }] })),
      updateProject: (id, patch) => set((s) => ({ projects: patchById<Project>(s.projects, id, patch) })),
      removeProject: (id) => set((s) => ({ projects: s.projects.filter((x) => x.id !== id) })),
      addMilestone: (projectId, title) =>
        set((s) => ({
          projects: patchMilestones(s.projects, projectId, (m) => [...m, { id: uid(), title, done: false }]),
        })),
      toggleMilestone: (projectId, milestoneId) =>
        set((s) => ({
          projects: patchMilestones(s.projects, projectId, (m) =>
            m.map((x) => (x.id === milestoneId ? { ...x, done: !x.done } : x)),
          ),
        })),
      removeMilestone: (projectId, milestoneId) =>
        set((s) => ({
          projects: patchMilestones(s.projects, projectId, (m) => m.filter((x) => x.id !== milestoneId)),
        })),

      addTopic: (courseId, title) =>
        set((s) => ({ topics: [...s.topics, { id: uid(), courseId, title, level: 0, step: 0, due: '' }] })),
      setTopicLevel: (id, level) =>
        set((s) => ({
          topics: s.topics.map((x) => {
            if (x.id !== id) return x
            if (level === 0) return { ...x, level, step: 0, due: '' }
            // first time it shows up in class: review it tomorrow
            return { ...x, level, due: x.due || inDays(REVIEW_INTERVALS[0]) }
          }),
        })),
      reviewTopic: (id, result) =>
        set((s) => ({
          topics: s.topics.map((x) => {
            if (x.id !== id) return x
            if (result === 'again') return { ...x, level: 1, step: 0, due: inDays(REVIEW_INTERVALS[0]) }
            const step = x.step + 1
            const level: TopicLevel = step >= 3 ? 3 : (Math.max(x.level, 2) as TopicLevel)
            return { ...x, step, level, due: inDays(REVIEW_INTERVALS[Math.min(step, REVIEW_INTERVALS.length - 1)]) }
          }),
        })),
      removeTopic: (id) => set((s) => ({ topics: s.topics.filter((x) => x.id !== id) })),

      addSession: (session) => set((s) => ({ sessions: [...s.sessions, { ...session, id: uid() }] })),
      removeSession: (id) => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),

      setReview: (week, patch) =>
        set((s) => ({
          reviews: { ...s.reviews, [week]: { ...EMPTY_REVIEW, ...(s.reviews[week] as WeekReview | undefined), ...patch } },
        })),

      importData: (data) => set(normalize(data)),
      resetAll: () => set(initial()),
    }),
    {
      name: 'polito-planner',
      version: 2,
      migrate: (persisted) => persisted as PlannerData & PlannerActions,
      // fill new fields and pref defaults when an older save doesn't have them yet
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<typeof current>
        return { ...current, ...normalize(p), prefs: { ...current.prefs, ...p.prefs } }
      },
    },
  ),
)

export const pickData = (s: PlannerData): PlannerData =>
  Object.fromEntries(DATA_KEYS.map((k) => [k, s[k]])) as unknown as PlannerData

/** Blocks that appear in a given week. */
export const blocksForWeek = (blocks: StudyBlock[], week: string) =>
  blocks.filter((b) => (b.repeat === 'weekly' ? b.week <= week : b.week === week))

/** Is this class on your week (not skipped every week, not skipped this week)? */
export const isAttending = (slot: Slot, skips: Record<string, string>, week: string) =>
  slot.attending && !(`${slot.id}|${week}` in skips)
