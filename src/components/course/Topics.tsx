import clsx from 'clsx'
import { X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { parseISO } from 'date-fns'
import { useT } from '../../lib/i18n'
import { useUI } from '../../lib/ui'
import { usePlanner } from '../../store'
import type { Course, TopicLevel } from '../../types'
import { isTopicDue, useDueTopics } from '../TopicReview'
import { Meter, Section } from '../ui'

export function Topics({ course }: { course: Course }) {
  const { t, fmt } = useT()
  const dueCount = useDueTopics(course.id).length
  const openReview = useUI((s) => s.setReviewOpen)
  const LEVELS = [t('level0'), t('level1'), t('level2'), t('level3')]
  const all = usePlanner((s) => s.topics)
  const { addTopic, setTopicLevel, removeTopic } = usePlanner.getState()
  const topics = useMemo(() => all.filter((x) => x.courseId === course.id), [all, course.id])
  const confident = topics.filter((x) => x.level === 3).length
  const [title, setTitle] = useState('')

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    addTopic(course.id, title.trim())
    setTitle('')
  }

  return (
    <Section title={t('topics')} aside={topics.length > 0 && t('confidentOf', { n: confident, total: topics.length })}>
      {topics.length > 0 && <Meter value={confident} total={topics.length} className="mb-3" />}
      {dueCount > 0 && (
        <button className="btn btn-primary mb-3 w-full justify-center" onClick={() => openReview(true)}>
          {t('reviewNow')} ({dueCount})
        </button>
      )}

      <ul>
        {topics.map((x) => (
          <li key={x.id} className="group flex items-center gap-2 py-1">
            <span className="min-w-0 flex-1 text-sm" title={x.due ? t('nextReview', { date: fmt(parseISO(x.due), 'd MMM') }) : undefined}>
              {x.title}
              {isTopicDue(x) && (
                <span className="ml-1.5 rounded bg-pen-soft px-1 py-px text-2xs font-bold text-pen">{t('reviewDue')}</span>
              )}
            </span>
            <button
              onClick={() => setTopicLevel(x.id, ((x.level + 1) % 4) as TopicLevel)}
              className="flex items-center gap-2 rounded-md px-1.5 py-0.5 text-xs text-ink-soft hover:bg-pen-soft"
              title={t('clickToChange')}
              aria-label={t('topicLevelLabel', { title: x.title, level: LEVELS[x.level] })}
            >
              {LEVELS[x.level]}
              <span className="flex gap-0.5" aria-hidden>
                {[1, 2, 3].map((n) => (
                  <span
                    key={n}
                    className={clsx(
                      'size-2.5 rounded-[2px] border',
                      n <= x.level ? 'border-[var(--ink)] bg-[var(--hl)]' : 'border-rule-strong',
                    )}
                  />
                ))}
              </span>
            </button>
            <button
              className="btn btn-danger p-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100"
              onClick={() => removeTopic(x.id)}
              aria-label={t('removeNamed', { name: x.title })}
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="mt-2">
        <input
          className="field"
          placeholder={t(topics.length ? 'addTopic' : 'addTopicFirst')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label={t('newTopic')}
        />
      </form>
    </Section>
  )
}
