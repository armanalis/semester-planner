import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DATA_KEYS, pickData, usePlanner, type PlannerData } from '../store'

type Status = 'off' | 'syncing' | 'synced' | 'error' | 'offline'

interface SyncState {
  code: string
  /** updatedAt of the version both sides agree on */
  lastSyncedAt: number
  /** when this device last changed something that isn't uploaded yet (0 = nothing pending) */
  dirtyAt: number
  status: Status
  /** error key from the server ('not_found', 'storage_missing', …) or a message */
  error: string
}

export const useSync = create<SyncState>()(
  persist(() => ({ code: '', lastSyncedAt: 0, dirtyAt: 0, status: 'off' as Status, error: '' }), {
    name: 'polito-sync',
    partialize: ({ code, lastSyncedAt, dirtyAt }) => ({ code, lastSyncedAt, dirtyAt }),
  }),
)

export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`
export const isValidCode = (code: string) => /^[A-HJ-NP-Z2-9]{8}$/.test(code)

class SyncError extends Error {}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new SyncError((body as { error?: string }).error ?? `http_${res.status}`)
  return body as T
}

let applyingRemote = false
function applyRemote(data: Partial<PlannerData>) {
  applyingRemote = true
  try {
    usePlanner.getState().importData(data)
  } finally {
    applyingRemote = false
  }
}

const fail = (error: unknown) =>
  useSync.setState({
    status: navigator.onLine ? 'error' : 'offline',
    error: error instanceof Error ? error.message : String(error),
  })

/** Make a new code from this device's planner. */
export async function createCode() {
  const updatedAt = Date.now()
  useSync.setState({ status: 'syncing', error: '' })
  try {
    const { code } = await api<{ code: string }>('/api/sync', {
      method: 'POST',
      body: JSON.stringify({ data: pickData(usePlanner.getState()), updatedAt }),
    })
    useSync.setState({ code, lastSyncedAt: updatedAt, dirtyAt: 0, status: 'synced' })
  } catch (e) {
    fail(e)
    throw e
  }
}

/** Replace this device's planner with the one behind `code`, and keep them in sync from now on. */
export async function joinCode(code: string) {
  useSync.setState({ status: 'syncing', error: '' })
  try {
    const record = await api<{ data: PlannerData; updatedAt: number }>(`/api/sync?code=${code}`)
    applyRemote(record.data)
    useSync.setState({ code, lastSyncedAt: record.updatedAt, dirtyAt: 0, status: 'synced' })
  } catch (e) {
    fail(e)
    throw e
  }
}

export function stopSync() {
  useSync.setState({ code: '', lastSyncedAt: 0, dirtyAt: 0, status: 'off', error: '' })
}

let pushing = false
async function push() {
  const { code, dirtyAt } = useSync.getState()
  if (!code || !dirtyAt || pushing) return
  pushing = true
  useSync.setState({ status: 'syncing' })
  try {
    const res = await api<{ ok?: boolean; conflict?: boolean; data?: PlannerData; updatedAt: number }>(`/api/sync?code=${code}`, {
      method: 'PUT',
      body: JSON.stringify({ data: pickData(usePlanner.getState()), updatedAt: dirtyAt }),
    })
    if (res.conflict && res.data) {
      // the other device saved something newer: take it
      applyRemote(res.data)
      useSync.setState({ lastSyncedAt: res.updatedAt, dirtyAt: 0 })
    } else {
      // only clear "pending" if nothing changed while we were uploading
      const stillSame = useSync.getState().dirtyAt === dirtyAt
      useSync.setState({ lastSyncedAt: dirtyAt, dirtyAt: stillSame ? 0 : useSync.getState().dirtyAt })
    }
    useSync.setState({ status: 'synced', error: '' })
  } catch (e) {
    fail(e)
  } finally {
    pushing = false
    if (useSync.getState().dirtyAt) schedulePush()
  }
}

/** Check for changes made on the other device. */
export async function pull() {
  const { code } = useSync.getState()
  if (!code || pushing) return
  try {
    const record = await api<{ data: PlannerData; updatedAt: number }>(`/api/sync?code=${code}`)
    const { lastSyncedAt, dirtyAt } = useSync.getState()
    if (record.updatedAt > lastSyncedAt && record.updatedAt >= dirtyAt) {
      applyRemote(record.data)
      useSync.setState({ lastSyncedAt: record.updatedAt, dirtyAt: 0 })
    } else if (dirtyAt) {
      await push()
      return
    }
    useSync.setState({ status: 'synced', error: '' })
  } catch (e) {
    fail(e)
  }
}

export async function syncNow() {
  if (useSync.getState().dirtyAt) await push()
  else await pull()
}

let pushTimer: ReturnType<typeof setTimeout> | undefined
function schedulePush() {
  clearTimeout(pushTimer)
  pushTimer = setTimeout(push, 1200)
}

let started = false
/** Call once when the app starts. */
export function startSync() {
  if (started) return
  started = true

  usePlanner.subscribe((state, prev) => {
    if (applyingRemote || !useSync.getState().code) return
    if (DATA_KEYS.some((k) => state[k] !== prev[k])) {
      useSync.setState({ dirtyAt: Date.now() })
      schedulePush()
    }
  })

  const onVisible = () => document.visibilityState === 'visible' && pull()
  window.addEventListener('focus', () => pull())
  window.addEventListener('online', () => syncNow())
  document.addEventListener('visibilitychange', onVisible)
  setInterval(() => document.visibilityState === 'visible' && pull(), 15_000)
  if (useSync.getState().code) syncNow()
}
