// ============================================================================
// PROPHET — format helpers
// Formatage € / % / prix par catégorie / dates relatives
// ============================================================================

import { getLang } from '../i18n/index.js'

const eurFormatters = new Map()

function eurFmt () {
  const lang = getLang()
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US'
  if (!eurFormatters.has(locale)) {
    eurFormatters.set(locale, new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }))
  }
  return eurFormatters.get(locale)
}

export function formatEUR (n) {
  if (n == null || isNaN(n)) return '—'
  return eurFmt().format(Number(n))
}

export function formatEURCompact (n) {
  if (n == null || isNaN(n)) return '—'
  const v = Number(n)
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M €`
  if (abs >= 10_000) return `${(v / 1000).toFixed(1)}k €`
  return formatEUR(v)
}

export function formatPct (n, decimals = 2) {
  if (n == null || isNaN(n)) return '—'
  const v = Number(n)
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(decimals)}%`
}

// Décimales adaptées à la catégorie d'actif (BTC vs SHIB)
export function formatPrice (price, category) {
  if (price == null || isNaN(price)) return '—'
  const v = Number(price)
  let decimals = 2
  if (category === 'crypto') {
    if (v < 0.01) decimals = 6
    else if (v < 1) decimals = 4
    else if (v < 100) decimals = 3
    else decimals = 2
  } else if (category === 'forex') {
    decimals = 4
  } else if (category === 'commodity') {
    decimals = 2
  }
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

// Format relatif "il y a X" / "in X" — pour le countdown / activity feed
export function formatRelativeFromNow (when) {
  const now = Date.now()
  const t = typeof when === 'string' ? Date.parse(when) : when?.getTime?.() || when
  if (!t) return '—'
  const diffMs = t - now
  const past = diffMs < 0
  const abs = Math.abs(diffMs)
  const seconds = Math.floor(abs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  const lang = getLang()
  const dict = lang === 'fr'
    ? { now: 'maintenant', s: 's', m: 'min', h: 'h', d: 'j', past: 'il y a', future: 'dans' }
    : { now: 'now', s: 's', m: 'm', h: 'h', d: 'd', past: '', future: 'in' }

  let val, unit
  if (days >= 1) { val = days; unit = dict.d }
  else if (hours >= 1) { val = hours; unit = dict.h }
  else if (minutes >= 1) { val = minutes; unit = dict.m }
  else if (seconds >= 5) { val = seconds; unit = dict.s }
  else return dict.now

  const core = `${val}${unit}`
  if (lang === 'fr') return past ? `${dict.past} ${core}` : `${dict.future} ${core}`
  return past ? `${core} ago` : `${dict.future} ${core}`
}

// Format compact d'un nombre (1234 -> 1.2k)
export function formatCompact (n) {
  if (n == null || isNaN(n)) return '—'
  const v = Number(n)
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(v)
}

export function formatWinrate (wins, losses) {
  const total = (wins || 0) + (losses || 0)
  if (total === 0) return '—'
  return `${((wins / total) * 100).toFixed(0)}%`
}
