import clsx from 'clsx'
import { CalendarPlus, ChevronDown, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useT } from '../../lib/i18n'
import { usePlanner } from '../../store'
import type { Course, Task } from '../../types'
import { Section, Tick } from '../ui'

export function DueChip({ due }: { due: string }) {
  const { dueLabel } = useT()
  if (!due) return null
  const { text, tone } = dueLabel(due)
  return (
    <span
      className={clsx(
        'shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold',
        tone === 'late' && 'bg-danger-soft text-danger',
        tone === 'soon' && 'bg-pen-soft text-pen',
        tone === 'later' && 'text-ink-soft',
      )}
    >
      {text}
    </span>
  )
}

export function Todos({ course, onPlan }: { course: Course; onPlan: (title: string) => void }) {
  const { t } = useT()
  const all = usePlanner((s) => s.tasks)
  const addTask = usePlanner((s) => s.addTask)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [showDone, setShowDone] = useState(false)

  const { open, finished } = useMemo(() => {
    const mine = all.filter((x) => x.courseId === course.id)
    const open = mine
      .filter((x) => !x.done)
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt - b.createdAt)
    return { open, finished: mine.filter((x) => x.done) }
  }, [all, course.id])

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    addTask(course.id, title.trim(), due)
    setTitle('')
    setDue('')
  }

  return (
    <Section title={t('myPlan')} aside={open.length > 0 && t('nOpen', { n: open.length })}>
      <form onSubmit={add} className="mb-3 flex flex-wrap gap-2">
        <input
          className="field min-w-48 flex-1"
          placeholder={t('todoPlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label={t('newTodo')}
        />
        <input type="date" className="field w-auto" value={due} onChange={(e) => setDue(e.target.value)} aria-label={t('dueOptional')} />
        <button className="btn btn-primary" type="submit">
          {t('add')}
        </button>
      </form>

      {open.length === 0 && finished.length === 0 && (
        <p className="py-2 text-ink-soft">
          {t('todoEmpty', { short: course.short })}
        </p>
      )}

      <ul className="divide-y divide-rule">
        {open.map((x) => (
          <TaskRow key={x.id} task={x} onPlan={onPlan} />
        ))}
      </ul>

      {finished.length > 0 && (
        <div className="mt-2">
          <button className="btn btn-quiet -ml-3 text-sm" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
            <ChevronDown size={16} className={clsx('transition-transform', !showDone && '-rotate-90')} />
            {t('doneCount', { n: finished.length })}
          </button>
          {showDone && (
            <ul className="divide-y divide-rule">
              {finished.map((x) => (
                <TaskRow key={x.id} task={x} onPlan={onPlan} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  )
}

function TaskRow({ task, onPlan }: { task: Task; onPlan: (title: string) => void }) {
  const { t } = useT()
  const { updateTask, toggleTask, removeTask } = usePlanner.getState()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [due, setDue] = useState(task.due)

  const save = (e?: FormEvent) => {
    e?.preventDefault()
    if (title.trim()) updateTask(task.id, { title: title.trim(), due })
    setEditing(false)
  }

  if (editing)
    return (
      <li className="py-2">
        <form onSubmit={save} className="flex flex-wrap gap-2" onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}>
          <input autoFocus className="field min-w-48 flex-1" value={title} onChange={(e) => setTitle(e.target.value)} aria-label={t('todo')} />
          <input type="date" className="field w-auto" value={due} onChange={(e) => setDue(e.target.value)} aria-label={t('dueDate')} />
          <button className="btn btn-primary" type="submit">
            {t('save')}
          </button>
          <button className="btn btn-quiet" type="button" onClick={() => setEditing(false)}>
            {t('cancel')}
          </button>
        </form>
      </li>
    )

  return (
    <li className="group flex items-center gap-3 py-2">
      <Tick checked={task.done} onChange={() => toggleTask(task.id)} label={t('doneLabel', { title: task.title })} />
      <button
        className={clsx('min-w-0 flex-1 text-left', task.done && 'text-ink-faint line-through')}
        onClick={() => setEditing(true)}
        title={t('edit')}
      >
        {task.title}
      </button>
      {!task.done && <DueChip due={task.due} />}
      <div className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
        {!task.done && (
          <button className="btn btn-quiet p-1.5" onClick={() => onPlan(task.title)} aria-label={t('planThis')} title={t('planThis')}>
            <CalendarPlus size={16} />
          </button>
        )}
        <button className="btn btn-danger p-1.5" onClick={() => removeTask(task.id)} aria-label={t('delete')} title={t('delete')}>
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  )
}
