// ============================================================================
// PROPHET — i18n core
// Auto-détection langue + toggle FR/EN persistant + broadcast lang-changed
// ============================================================================

import { fr } from './fr.js'
import { en } from './en.js'

const DICTS = { fr, en }
const STORAGE_KEY = 'prophet.lang'
const DEFAULT_LANG = 'en'

let currentLang = detectInitialLang()

function detectInitialLang () {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'fr' || stored === 'en') return stored
  } catch (_) {}
  const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase()
  return nav.startsWith('fr') ? 'fr' : DEFAULT_LANG
}

export function getLang () {
  return currentLang
}

export function setLang (code) {
  if (code !== 'fr' && code !== 'en') return
  if (currentLang === code) return
  currentLang = code
  try { localStorage.setItem(STORAGE_KEY, code) } catch (_) {}
  document.documentElement.setAttribute('lang', code)
  window.dispatchEvent(new CustomEvent('lang-changed', { detail: { lang: code } }))
}

// t('login.cta') ou t('hello.user', { name: 'Axel' })
export function t (key, vars) {
  const dict = DICTS[currentLang] || DICTS[DEFAULT_LANG]
  let str = lookup(dict, key)
  if (str == null) str = lookup(DICTS[DEFAULT_LANG], key)
  if (str == null) return key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return str
}

function lookup (dict, key) {
  const parts = key.split('.')
  let node = dict
  for (const p of parts) {
    if (node && typeof node === 'object' && p in node) node = node[p]
    else return null
  }
  return typeof node === 'string' ? node : null
}

// Init au boot : appliquer attribut <html lang>
document.documentElement.setAttribute('lang', currentLang)
