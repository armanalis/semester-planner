import { useEffect, useState } from 'react'
import { Outlet } from 'react-router'
import { startSync, useSync } from '../lib/sync'
import { useUI } from '../lib/ui'
import { usePlanner } from '../store'
import { FocusWidget } from './FocusWidget'
import { usePrefsOnDocument } from './Layout'
import { SyncDialog } from './SyncDialog'
import { TopicReviewDialog } from './TopicReview'

/** Wraps every page: theme/language, sync, the focus timer and app-wide dialogs. */
export default function Root() {
  usePrefsOnDocument()
  const onboarded = usePlanner((s) => s.onboarded)
  // read a ?sync=CODE link (from the QR code) on first render, before any redirect drops the query
  const [linkCode] = useState(() => new URLSearchParams(location.search).get('sync'))

  useEffect(() => {
    startSync()
    if (!linkCode) return
    const params = new URLSearchParams(location.search)
    if (params.has('sync')) {
      params.delete('sync')
      history.replaceState(history.state, '', location.pathname + (params.size ? `?${params}` : '') + location.hash)
    }
    if (useSync.getState().code !== linkCode.toUpperCase()) useUI.getState().openSync(linkCode)
  }, [linkCode])

  return (
    <>
      <Outlet />
      {onboarded && <FocusWidget />}
      <SyncDialog />
      <TopicReviewDialog />
    </>
  )
}
