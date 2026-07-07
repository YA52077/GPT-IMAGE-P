import { useState, useEffect } from 'react'

const REPO = 'YA52077/GPT-IMAGE-P'
const API_URL = `https://api.github.com/repos/${REPO}/releases?per_page=1`
const versionCheckCache = new Map<string, LatestRelease | null>()
const versionCheckInFlight = new Map<string, Promise<LatestRelease | null>>()

function compareVersions(a: string, b: string) {
  const aParts = a.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const bParts = b.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(aParts.length, bParts.length)

  for (let i = 0; i < length; i += 1) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0)
    if (diff !== 0) return diff
  }

  return 0
}

export interface LatestRelease {
  tag: string
  url: string
}

/**
 * 检查 GitHub 最新 Release 版本。
 * - 仅当最新 Release 版本高于当前 __APP_VERSION__ 时提示。
 * - 用户点击后调用 dismiss()，本次浏览期间不再提示（sessionStorage）。
 * - 刷新页面后重新检查。
 */
export function useVersionCheck() {
  const [latestRelease, setLatestRelease] = useState<LatestRelease | null>(null)
  const [dismissed, setDismissed] = useState(() =>
    sessionStorage.getItem('version-dismissed') === 'true',
  )

  useEffect(() => {
    let cancelled = false

    const cached = versionCheckCache.get(REPO)
    if (cached !== undefined) {
      setLatestRelease(cached)
      return () => {
        cancelled = true
      }
    }

    let request = versionCheckInFlight.get(REPO)
    if (!request) {
      request = fetch(API_URL, { headers: { Accept: 'application/vnd.github.v3+json' } })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then((data) => {
          const latest = Array.isArray(data) ? data[0] : null
          if (!latest) return null
          const tag: string = latest.tag_name ?? ''
          const version = tag.replace(/^v/, '')
          if (!version || compareVersions(version, __APP_VERSION__) <= 0) return null
          return {
            tag,
            url: latest.html_url ?? `https://github.com/${REPO}/releases/latest`,
          }
        })
        .catch(() => null)
        .then((result) => {
          versionCheckCache.set(REPO, result)
          versionCheckInFlight.delete(REPO)
          return result
        })
      versionCheckInFlight.set(REPO, request)
    }

    request.then((result) => {
      if (cancelled) return
      setLatestRelease(result)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const dismiss = () => {
    setDismissed(true)
    sessionStorage.setItem('version-dismissed', 'true')
  }

  const hasUpdate = latestRelease !== null && !dismissed

  return { hasUpdate, latestRelease, dismiss }
}
