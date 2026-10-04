import type { Course, Profile, Slot, SlotKind } from '../types'

const course = (c: Pick<Course, 'id' | 'name' | 'short' | 'hue'>): Course => ({
  professor: '',
  credits: '',
  examDate: '',
  examFormat: '',
  notes: '',
  links: [],
  ...c,
})

export const SEED_COURSES: Course[] = [
  course({ id: 'itds', name: 'Information Theory for Data Science', short: 'ITDS', hue: 'yellow' }),
  course({ id: 'dmv', name: 'Data Management and Visualization', short: 'DMV', hue: 'cyan' }),
  course({ id: 'im', name: 'Innovation Management', short: 'IM', hue: 'slate' }),
  course({ id: 'dsml', name: 'Data Science and Machine Learning Lab', short: 'DSML', hue: 'orange' }),
  course({ id: 'cla', name: 'Computational Linear Algebra for Large Scale Problems', short: 'CLA', hue: 'pink' }),
]

const t = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

let n = 0
const slot = (courseId: string, day: number, start: string, end: string, kind: SlotKind = 'lecture'): Slot => ({
  id: `seed-${++n}`,
  courseId,
  day,
  start: t(start),
  end: t(end),
  kind,
  room: '',
  attending: true,
})

/** Timetable from the Polito calendar, week of 5 Oct 2026. */
export const SEED_SLOTS: Slot[] = [
  // Monday
  slot('cla', 0, '8:30', '10:00'),
  slot('dsml', 0, '10:00', '11:30'),
  slot('dsml', 0, '11:30', '13:00'),
  slot('im', 0, '13:00', '14:30'),
  slot('dmv', 0, '13:00', '16:00'),
  slot('dsml', 0, '16:00', '17:30'),
  // Tuesday
  slot('dsml', 1, '8:30', '10:00'),
  slot('dsml', 1, '10:00', '11:30'),
  slot('dmv', 1, '11:30', '13:00'),
  slot('dmv', 1, '13:00', '14:30'),
  slot('dmv', 1, '14:30', '16:00'),
  slot('itds', 1, '16:00', '19:00'),
  slot('im', 1, '17:30', '19:00'),
  // Wednesday
  slot('cla', 2, '8:30', '10:00'),
  slot('itds', 2, '10:00', '13:00'),
  slot('im', 2, '13:00', '14:30'),
  slot('dsml', 2, '16:00', '19:00'),
  // Thursday
  slot('dsml', 3, '10:00', '11:30'),
  slot('dsml', 3, '11:30', '13:00'),
  slot('dmv', 3, '16:00', '17:30'),
  slot('dmv', 3, '17:30', '19:00'),
  // Friday
  slot('cla', 4, '10:00', '13:00'),
]

/** The Polito Data Science MSc template, 1st semester 2026/27. */
export const TEMPLATE_PROFILE: Profile = {
  name: '',
  university: 'Politecnico di Torino',
  program: 'Data Science and Engineering (MSc)',
  semesterStart: '2026-09-21',
}
