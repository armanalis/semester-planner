import { useRouteError } from 'react-router'
import { useT } from '../lib/i18n'

/** Shown instead of React Router's developer error page when a page crashes. */
export default function RouteError() {
  const { t } = useT()
  const error = useRouteError()
  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">{t('errorTitle')}</h1>
      <p className="mt-2 text-ink-soft">{t('errorBody')}</p>
      <button className="btn btn-primary btn-lg mt-6" onClick={() => location.reload()}>
        {t('reload')}
      </button>
      {error instanceof Error && <p className="mt-8 text-xs break-words text-ink-faint">{error.message}</p>}
    </main>
  )
}
