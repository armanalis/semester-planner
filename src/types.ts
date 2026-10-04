export type Lang = 'en' | 'tr'

export type Theme = 'system' | 'light' | 'dark'

export type HueKey = 'pink' | 'orange' | 'yellow' | 'cyan' | 'slate' | 'green' | 'violet'

export type SlotKind = 'lecture' | 'lab' | 'practice'

export interface CourseLink {
  id: string
  label: string
  url: string
}

export interface Course {
  id: string
  name: string
  short: string
  hue: HueKey
  professor: string
  credits: string
  examDate: string // yyyy-MM-dd or ''
  examFormat: string
  notes: string
  links: CourseLink[]
}

/** A timetable slot from the official schedule. Minutes from midnight. */
export interface Slot {
  id: string
  courseId: string
  day: number // 0 = Monday … 6 = Sunday
  start: number
  end: number
  kind: SlotKind
  room: string
  /** false = skipped every week */
  attending: boolean
}

/** A study block you plan yourself. */
export interface StudyBlock {
  id: string
  courseId: string
  day: number
  start: number
  end: number
  title: string
  repeat: 'weekly' | 'once'
  week: string // Monday of the week it was created for (yyyy-MM-dd)
}

export interface Task {
  id: string
  courseId: string
  title: string
  due: string // yyyy-MM-dd or ''
  done: boolean
  createdAt: number
  doneAt?: number
}

export interface Milestone {
  id: string
  title: string
  done: boolean
}

export interface Project {
  id: string
  courseId: string
  title: string
  due: string
  milestones: Milestone[]
}

export type TopicLevel = 0 | 1 | 2 | 3

export interface Topic {
  id: string
  courseId: string
  title: string
  level: TopicLevel
  /** successful reviews in a row (spaced repetition) */
  step: number
  /** next review date yyyy-MM-dd, '' = not scheduled */
  due: string
}

export interface Profile {
  name: string
  university: string
  program: string
  semesterStart: string // yyyy-MM-dd or ''
}

/** One finished focus (pomodoro) session. */
export interface FocusSession {
  id: string
  courseId: string // '' = no course
  blockId: string
  label: string
  start: number // epoch ms
  minutes: number
}

export interface WeekReview {
  well: string
  hard: string
  change: string
  doneAt: number // 0 = not finished
}
