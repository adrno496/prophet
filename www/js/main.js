// ============================================================================
// PROPHET — main.js
// Boot SPA : router hash-based, mount header + bottom-tabs + view active
// ============================================================================

import { requireAuth, onAuthChange } from './auth.js'
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

  function loadView (id) {
    active = id
    setHash(id)
    viewEl.innerHTML = ''
    VIEWS[id](viewEl)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const tabs = mountTabs(tabsEl, {
    current: active,
    onChange: loadView
  })

  // Charger la vue initiale
  loadView(active)

  // Synchro hash → tabs (back button)
  window.addEventListener('hashchange', () => {
    const id = currentView()
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
