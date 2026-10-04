import { ExternalLink, Plus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useT } from '../../lib/i18n'
import { usePlanner } from '../../store'
import type { Course } from '../../types'
import { Section } from '../ui'

export function Links({ course }: { course: Course }) {
  const { t } = useT()
  const { addLink, removeLink } = usePlanner.getState()
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    const href = /^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`
    addLink(course.id, label.trim() || new URL(href).hostname, href)
    setLabel('')
    setUrl('')
    setAdding(false)
  }

  return (
    <Section title={t('links')}>
      <ul className="space-y-1">
        {course.links.map((l) => (
          <li key={l.id} className="group flex items-center gap-2">
            <a href={l.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-pen hover:underline">
              <ExternalLink size={14} className="shrink-0" />
              <span className="truncate">{l.label}</span>
            </a>
            <button
              className="btn btn-danger p-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100"
              onClick={() => removeLink(course.id, l.id)}
              aria-label={t('removeNamed', { name: l.label })}
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
      {course.links.length === 0 && !adding && (
        <p className="text-sm text-ink-soft">{t('linksEmpty')}</p>
      )}
      {adding ? (
        <form onSubmit={add} className="mt-2 space-y-2" onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}>
          <input autoFocus className="field" placeholder={t('linkNamePlaceholder')} value={label} onChange={(e) => setLabel(e.target.value)} aria-label={t('linkName')} />
          <input className="field" placeholder="https://didattica.polito.it/…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label={t('address')} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-quiet" onClick={() => setAdding(false)}>
              {t('cancel')}
            </button>
            <button className="btn btn-primary">{t('addLink')}</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-quiet mt-1 -ml-3 text-pen" onClick={() => setAdding(true)}>
          <Plus size={16} /> {t('addLink')}
        </button>
      )}
    </Section>
  )
}
