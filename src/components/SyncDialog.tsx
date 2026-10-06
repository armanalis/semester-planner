import { formatDistanceToNowStrict } from 'date-fns'
import { Check, Copy, RefreshCw, Smartphone } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState, type FormEvent } from 'react'
import { useT } from '../lib/i18n'
import { createCode, formatCode, isValidCode, joinCode, normalizeCode, stopSync, syncNow, useSync } from '../lib/sync'
import { useUI } from '../lib/ui'
import { Dialog } from './ui'

const isLocalhost = () => ['localhost', '127.0.0.1', '::1'].includes(location.hostname)

/** Address a phone can open: this page's address, or the computer's Wi-Fi address when running on localhost. */
function usePhoneOrigin() {
  const [origin, setOrigin] = useState<string | null>(isLocalhost() ? null : location.origin)
  useEffect(() => {
    if (!isLocalhost()) return
    fetch('/api/lan')
      .then((r) => r.json())
      .then((b: { url: string | null }) => setOrigin(b.url))
      .catch(() => setOrigin(null))
  }, [])
  return origin
}

export function SyncDialog() {
  const { t } = useT()
  const open = useUI((s) => s.syncOpen)
  const close = useUI((s) => s.closeSync)
  return (
    <Dialog open={open} onClose={close} title={t('syncTitle')} wide>
      <SyncBody />
    </Dialog>
  )
}

function useErrorText() {
  const { t } = useT()
  return (error: string) =>
    ({
      not_found: t('codeNotFound'),
      invalid_code: t('invalidCode'),
      storage_missing: t('storageMissing'),
      rate_limited: t('rateLimited'),
    })[error] ?? (navigator.onLine ? t('syncError', { error }) : t('offline'))
}

function SyncBody() {
  const { code } = useSync()
  return code ? <Connected /> : <NotConnected />
}

function NotConnected() {
  const { t } = useT()
  const prefill = useUI((s) => s.syncCode)
  const close = useUI((s) => s.closeSync)
  const errorText = useErrorText()
  const [input, setInput] = useState(prefill ? formatCode(normalizeCode(prefill)) : '')
  const [confirming, setConfirming] = useState(!!prefill)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const code = normalizeCode(input)

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      await createCode()
    } catch (e) {
      setError(errorText((e as Error).message))
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!isValidCode(code)) return setError(t('invalidCode'))
    setError('')
    setConfirming(true)
  }

  const join = async () => {
    setBusy(true)
    setError('')
    try {
      await joinCode(code)
      close()
    } catch (e) {
      setError(errorText((e as Error).message))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-soft">{t('syncIntro')}</p>

      <button className="btn btn-primary" onClick={create} disabled={busy}>
        <Smartphone size={16} /> {t('createCode')}
      </button>

      <div className="border-t border-rule pt-4">
        <p className="mb-2 font-semibold">{t('haveCode')}</p>
        {confirming ? (
          <div className="rounded-xl bg-danger-soft p-3">
            <p className="text-sm">{t('replaceWarning')}</p>
            <p className="mt-1 font-mono text-lg font-bold tracking-widest">{formatCode(code)}</p>
            <div className="mt-2 flex gap-2">
              <button className="btn btn-primary" onClick={join} disabled={busy}>
                {t('replaceAndConnect')}
              </button>
              <button className="btn btn-quiet" onClick={() => setConfirming(false)}>
                {t('cancel')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex gap-2">
            <input
              className="field max-w-48 text-lg font-bold tracking-widest uppercase"
              placeholder="XXXX-XXXX"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-label={t('haveCode')}
            />
            <button className="btn btn-quiet border border-rule-strong" type="submit">
              {t('connect')}
            </button>
          </form>
        )}
      </div>

      {error && (
        <p className="text-sm font-semibold text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function Connected() {
  const T = useT()
  const { t } = T
  const { code, status, error, lastSyncedAt } = useSync()
  const errorText = useErrorText()
  const phoneOrigin = usePhoneOrigin()
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const [, tick] = useState(0)

  const link = phoneOrigin ? `${phoneOrigin}/?sync=${code}` : ''

  useEffect(() => {
    if (!link) return setQr('')
    QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: '#1b2540', light: '#ffffff' } }).then(setQr)
  }, [link])

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 15_000)
    return () => clearInterval(id)
  }, [])

  const copy = async () => {
    const text = formatCode(code)
    if (navigator.clipboard) await navigator.clipboard.writeText(text)
    else {
      // clipboard API needs HTTPS; plain http on the local network uses the old way
      const area = Object.assign(document.createElement('textarea'), { value: text })
      document.body.append(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const ago =
    lastSyncedAt && Date.now() - lastSyncedAt > 20_000
      ? formatDistanceToNowStrict(lastSyncedAt, { addSuffix: true, locale: T.locale })
      : t('justNow')

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex-1">
          <p className="text-sm text-ink-soft">{t('yourCode')}</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="font-mono text-3xl font-bold tracking-[0.2em]">{formatCode(code)}</p>
            <button className="btn btn-quiet p-1.5" onClick={copy} aria-label={t('copy')} title={copied ? t('copied') : t('copy')}>
              {copied ? <Check size={17} className="text-pen" /> : <Copy size={17} />}
            </button>
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm" role="status">
            <span
              className={
                status === 'error' || status === 'offline'
                  ? 'size-2 rounded-full bg-danger'
                  : status === 'syncing'
                    ? 'size-2 animate-pulse rounded-full bg-pen'
                    : 'size-2 rounded-full bg-ok'
              }
              aria-hidden
            />
            {status === 'syncing'
              ? t('syncing')
              : status === 'error' || status === 'offline'
                ? errorText(error)
                : t('syncedAgo', { time: ago })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-quiet border border-rule-strong" onClick={() => syncNow()}>
              <RefreshCw size={15} /> {t('syncNow')}
            </button>
            <button className="btn btn-danger" onClick={stopSync}>
              {t('stopSync')}
            </button>
          </div>
        </div>

        {qr && (
          <figure className="shrink-0 text-center">
            <img src={qr} alt="" className="mx-auto size-40 rounded-lg ring-1 ring-rule-strong" />
            <figcaption className="mt-2 max-w-40 text-xs text-ink-soft">{t('scanOnPhone')}</figcaption>
          </figure>
        )}
      </div>

      {isLocalhost() && (
        <p className="rounded-lg bg-pen-soft px-3 py-2 text-xs text-ink-soft">
          {phoneOrigin ? t('lanHint', { url: phoneOrigin }) : t('lanMissing')}
        </p>
      )}
    </div>
  )
}
