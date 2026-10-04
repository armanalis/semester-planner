import { Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useT } from '../../lib/i18n'
import { usePlanner } from '../../store'
import type { Course, Project } from '../../types'
import { Meter, Section, Tick } from '../ui'
import { DueChip } from './Todos'

export function Projects({ course }: { course: Course }) {
  const { t } = useT()
  const all = usePlanner((s) => s.projects)
  const addProject = usePlanner((s) => s.addProject)
  const projects = useMemo(() => all.filter((p) => p.courseId === course.id), [all, course.id])
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    addProject(course.id, title.trim(), due)
    setTitle('')
    setDue('')
    setAdding(false)
  }

  return (
    <Section
      title={t('projects')}
      aside={
        !adding && (
          <button className="btn btn-quiet -mr-3 py-1 text-pen" onClick={() => setAdding(true)}>
            <Plus size={16} /> {t('addProject')}
          </button>
        )
      }
    >
      {adding && (
        <form onSubmit={add} className="mb-4 flex flex-wrap gap-2" onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}>
          <input autoFocus className="field min-w-48 flex-1" placeholder={t('projectName')} value={title} onChange={(e) => setTitle(e.target.value)} aria-label={t('projectName')} />
          <input type="date" className="field w-auto" value={due} onChange={(e) => setDue(e.target.value)} aria-label={t('deadlineOptional')} />
          <button className="btn btn-primary">{t('addProject')}</button>
          <button type="button" className="btn btn-quiet" onClick={() => setAdding(false)}>
            {t('cancel')}
          </button>
        </form>
      )}

      {projects.length === 0 && !adding && (
        <p className="py-2 text-ink-soft">{t('noProjects')}</p>
      )}

      <div className="space-y-6">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </Section>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const { t } = useT()
  const { removeProject, addMilestone, toggleMilestone, removeMilestone } = usePlanner.getState()
  const [step, setStep] = useState('')
  const [confirm, setConfirm] = useState(false)
  const doneSteps = project.milestones.filter((m) => m.done).length
  const total = project.milestones.length
  const pct = total ? Math.round((doneSteps / total) * 100) : 0

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!step.trim()) return
    addMilestone(project.id, step.trim())
    setStep('')
  }

  return (
    <article>
      <div className="flex items-center gap-3">
        <h3 className="min-w-0 flex-1 truncate font-bold">{project.title}</h3>
        <DueChip due={project.due} />
        {confirm ? (
          <span className="flex items-center gap-1 text-sm">
            <button className="btn btn-danger py-1" onClick={() => removeProject(project.id)}>
              {t('deleteProject')}
            </button>
            <button className="btn btn-quiet p-1" onClick={() => setConfirm(false)} aria-label={t('keepProject')}>
              <X size={16} />
            </button>
          </span>
        ) : (
          <button className="btn btn-quiet p-1.5" onClick={() => setConfirm(true)} aria-label={t('deleteNamed', { name: project.title })}>
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <Meter value={doneSteps} total={total} className="flex-1" />
        <span className="w-24 text-right text-sm text-ink-soft">
          {total ? t('progress', { pct, done: doneSteps, total }) : t('noSteps')}
        </span>
      </div>

      <ul className="mt-2">
        {project.milestones.map((m) => (
          <li key={m.id} className="group flex items-center gap-3 py-1">
            <Tick size={18} checked={m.done} onChange={() => toggleMilestone(project.id, m.id)} label={t('doneLabel', { title: m.title })} />
            <span className={m.done ? 'flex-1 text-ink-faint line-through' : 'flex-1'}>{m.title}</span>
            <button
              className="btn btn-danger p-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100"
              onClick={() => removeMilestone(project.id, m.id)}
              aria-label={t('removeNamed', { name: m.title })}
            >
              <X size={15} />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-1 flex items-center gap-3">
        <Plus size={18} className="shrink-0 text-ink-faint" />
        <input
          className="flex-1 border-b border-transparent bg-transparent py-1 text-sm placeholder:text-ink-faint focus:border-pen focus:outline-none"
          placeholder={t('addStep')}
          value={step}
          onChange={(e) => setStep(e.target.value)}
          aria-label={t('addStepTo', { name: project.title })}
        />
      </form>
    </article>
  )
}
