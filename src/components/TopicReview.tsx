import { useMemo } from 'react'
import { hueVars } from '../lib/hues'
import { useT } from '../lib/i18n'
import { isoDay } from '../lib/time'
import { useUI } from '../lib/ui'
import { usePlanner } from '../store'
import type { Topic } from '../types'
import { Dialog } from './ui'

/** Topics whose next review date is today or earlier. */
export function useDueTopics(courseId?: string) {
  const topics = usePlanner((s) => s.topics)
  return useMemo(() => {
    const today = isoDay(new Date())
    return topics
      .filter((x) => x.due && x.due <= today && (!courseId || x.courseId === courseId))
      .sort((a, b) => a.due.localeCompare(b.due))
  }, [topics, courseId])
}

export const isTopicDue = (topic: Topic) => !!topic.due && topic.due <= isoDay(new Date())

export function TopicReviewDialog() {
  const { t } = useT()
  const open = useUI((s) => s.reviewOpen)
  const setOpen = useUI((s) => s.setReviewOpen)
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title={t('reviewTopics')} wide>
      <TopicReviewList />
    </Dialog>
  )
}

function TopicReviewList() {
  const { t } = useT()
  const due = useDueTopics()
  const courses = usePlanner((s) => s.courses)
  const reviewTopic = usePlanner((s) => s.reviewTopic)
  const levels = [t('level0'), t('level1'), t('level2'), t('level3')]

  if (due.length === 0) return <p className="py-4 text-ink-soft">{t('allCaughtUp')}</p>

  return (
    <div>
      <p className="mb-4 text-sm text-ink-soft">{t('reviewIntro')}</p>
      <ul className="divide-y divide-rule">
        {due.map((x) => {
          const c = courses.find((cc) => cc.id === x.courseId)
          return (
            <li key={x.id} className="flex flex-wrap items-center gap-3 py-2.5" style={c ? hueVars(c.hue) : undefined}>
              <span className="rounded bg-[var(--hl)] px-1.5 py-0.5 text-xs font-bold text-[var(--ink)]">{c?.short}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{x.title}</span>
                <span className="block text-xs text-ink-soft">{levels[x.level]}</span>
              </span>
              <div className="flex gap-1.5">
                <button className="btn btn-quiet border border-rule-strong py-1" onClick={() => reviewTopic(x.id, 'again')}>
                  {t('forgot')}
                </button>
                <button className="btn btn-primary py-1" onClick={() => reviewTopic(x.id, 'good')}>
                  {t('gotIt')}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
