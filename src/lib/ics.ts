/** The parts of a calendar invitation (.ics file) the planner uses. */
export interface Invite {
  title: string
  location: string
  start: Date
  end: Date
  allDay: boolean
  weekly: boolean
}

type Parts = [number, number, number, number, number, number]

interface Prop {
  params: Record<string, string>
  value: string
}

/** "NAME;KEY=val:value" → name, params, value. Colons inside quoted params don't end the name. */
function parseLine(line: string): [string, Prop] {
  let quoted = false
  let i = 0
  for (; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted
    else if (line[i] === ':' && !quoted) break
  }
  const [name, ...params] = line.slice(0, i).split(';')
  return [
    name.toUpperCase(),
    {
      params: Object.fromEntries(
        params.map((p) => {
          const at = p.indexOf('=')
          return [p.slice(0, at).toUpperCase(), p.slice(at + 1).replace(/^"|"$/g, '')]
        }),
      ),
      value: line.slice(i + 1),
    },
  ]
}

/** Every VEVENT's own properties (alarms inside an event are left out). */
function events(text: string) {
  const found: Map<string, Prop>[] = []
  const stack: string[] = []
  // a line starting with a space or tab continues the one before it
  for (const line of text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const [name, prop] = parseLine(line)
    const value = prop.value.trim().toUpperCase()
    if (name === 'BEGIN') {
      stack.push(value)
      if (value === 'VEVENT') found.push(new Map())
    } else if (name === 'END') stack.pop()
    else if (stack.at(-1) === 'VEVENT' && !found.at(-1)!.has(name)) found.at(-1)!.set(name, prop)
  }
  return found
}

const unescape = (v: string) => v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c)).trim()

/** The moment the wall clock in `timeZone` shows `p`, or null if the zone name is unknown. */
function inZone(p: Parts, timeZone: string) {
  let fmt: Intl.DateTimeFormat
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
  } catch {
    return null
  }
  const offsetAt = (t: number) => {
    const o = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, Number(x.value)]))
    return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - t
  }
  const wall = Date.UTC(...p)
  // a second pass corrects the offset when the first guess lands across a clock change
  return new Date(wall - offsetAt(wall - offsetAt(wall)))
}

/** DTSTART/DTEND: a date (all day), a UTC time (…Z), a time in TZID, or a floating local time. */
function toDate(prop: Prop | undefined) {
  const m = prop?.value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/)
  if (!prop || !m) return null
  const p: Parts = [+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)]
  if (!m[4]) return { date: new Date(p[0], p[1], p[2]), allDay: true }
  if (m[7]) return { date: new Date(Date.UTC(...p)), allDay: false }
  const tz = prop.params.TZID && inZone(p, prop.params.TZID)
  return { date: tz || new Date(...p), allDay: false }
}

/** "PT1H30M" → milliseconds. */
function duration(v: string) {
  const m = v.trim().match(/^\+?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
  if (!m) return 0
  const [w, d, h, min, s] = m.slice(1).map((x) => Number(x ?? 0))
  return ((((w * 7 + d) * 24 + h) * 60 + min) * 60 + s) * 1000
}

/** Reads the event from an invitation. Null when the file has no event with a start date. */
export function readInvite(text: string): Invite | null {
  const all = events(text)
  // a recurring invite can carry changed single dates (RECURRENCE-ID); the main event has none
  const ev = all.find((e) => !e.has('RECURRENCE-ID')) ?? all[0]
  const start = toDate(ev?.get('DTSTART'))
  if (!ev || !start) return null

  const length = ev.has('DURATION') ? duration(ev.get('DURATION')!.value) : 0
  const end =
    toDate(ev.get('DTEND'))?.date ?? new Date(start.date.getTime() + (length || (start.allDay ? 86_400_000 : 3_600_000)))
  const rule = ev.get('RRULE')?.value.toUpperCase() ?? ''
  const interval = rule.match(/INTERVAL=(\d+)/)?.[1]

  return {
    title: unescape(ev.get('SUMMARY')?.value ?? ''),
    location: unescape(ev.get('LOCATION')?.value ?? ''),
    start: start.date,
    end,
    allDay: start.allDay,
    weekly: /FREQ=WEEKLY/.test(rule) && (!interval || interval === '1'),
  }
}
