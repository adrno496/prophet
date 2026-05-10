// ============================================================================
// PROPHET — main.js
// Boot SPA : router hash-based, mount header + bottom-tabs + view active
// ============================================================================

import { requireAuth, onAuthChange } from './auth.js'
import { startTicking, tickAll } from './tick.js'
import { celebrateWin, celebrateLoss } from './components/celebration.js'
import { store } from './state.js'
import { mountHeader } from './components/header.js'
import { mountTabs } from './components/bottom-tabs.js'
import { mountDashboard } from './views/dashboard.js'
import { mountProfile } from './views/profile.js'
import { mountMarkets } from './views/markets.js'
import { mountPositions } from './views/positions.js'
import { mountLeaderboard } from './views/leaderboard.js'

const VIEWS = {
  home:        (root) => mountDashboard(root),
  markets:     (root) => mountMarkets(root),
  positions:   (root) => mountPositions(root),
  leaderboard: (root) => mountLeaderboard(root),
  profile:     (root) => mountProfile(root)
}

function currentView () {
  const hash = window.location.hash.replace('#', '')
  return VIEWS[hash] ? hash : 'home'
}

function setHash (id) {
  if (window.location.hash !== `#${id}`) {
    window.history.replaceState(null, '', `#${id}`)
  }
}

async function boot () {
  // Vérifier session : redirige vers login si pas connecté
  const session = await requireAuth()
  if (!session) return

  store.set('user', session.user)

  // Listener pour les changements d'auth (logout depuis autre onglet, etc.)
  onAuthChange(({ event }) => {
    if (event === 'SIGNED_OUT') {
      window.location.replace('index.html')
    }
  })

  // Header sticky
  const headerEl = document.querySelector('#app-header')
  if (headerEl) mountHeader(headerEl)

  // Bottom tabs
  const tabsEl = document.querySelector('#app-tabs')
  const viewEl = document.querySelector('#view')
  let active = currentView()
  let currentCleanup = null

  async function loadView (id) {
    // Démontage propre de la vue précédente (Realtime channels, intervals, listeners)
    if (typeof currentCleanup === 'function') {
      try { currentCleanup() } catch (e) { console.warn('[loadView] cleanup error', e) }
      currentCleanup = null
    }

    active = id
    setHash(id)
    viewEl.innerHTML = ''
    const result = VIEWS[id](viewEl)
    // Le mount peut renvoyer une cleanup fn directe, ou une Promise qui en renvoie une
    if (result && typeof result.then === 'function') {
      currentCleanup = await result.catch(e => {
        console.warn('[loadView] mount error', e)
        return null
      })
    } else {
      currentCleanup = result
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const tabs = mountTabs(tabsEl, {
    current: active,
    onChange: loadView
  })

  // Charger la vue initiale
  loadView(active)

  // Démarrer le tick auto 5min (live data refresh)
  startTicking()
  tickAll().catch(() => {})

  // Listener global : célébration win/loss quand une position résout via Realtime
  // (le subscribeToOwnPositions est démarré par dashboard/positions, mais le
  //  listener vit ici pour fonctionner même si la vue active n'est pas concernée)
  window.addEventListener('positions-changed', (e) => {
    const payload = e.detail
    if (!payload || payload.eventType !== 'UPDATE') return
    const newRow = payload.new, oldRow = payload.old
    if (!newRow || !oldRow) return
    if (oldRow.status === 'open' && newRow.status === 'won') {
      const amount = Number(newRow.pnl || 0) + Number(newRow.stake || 0)
      celebrateWin(amount)
    } else if (oldRow.status === 'open' && (newRow.status === 'lost' || newRow.status === 'liquidated')) {
      celebrateLoss(newRow.stake || 0)
    }
  })

  // Synchro hash → tabs (back button)
  window.addEventListener('hashchange', () => {
    const id = currentView()
    // Guard : ignore les hashes inconnus pour éviter VIEWS[undefined](el) crash
    if (!VIEWS[id]) return
    if (id !== active) {
      tabs.setActive(id)
      loadView(id)
    }
  })
}

boot().catch(err => {
  console.error('Boot error:', err)
  document.body.innerHTML = `<div class="container" style="padding:var(--sp-8) var(--sp-4);text-align:center;color:var(--red)">Boot error · ${err.message || err}</div>`
})

// Service worker (PWA) — best effort, ignore en Capacitor
if ('serviceWorker' in navigator && location.protocol !== 'capacitor:') {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}
