// ============================================================================
// PROPHET — Header component
// Sticky top : logo · niveau · balance live · bouton hard-refresh
// ============================================================================

import { store } from '../state.js'
import { t, getLang } from '../i18n/index.js'
import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { formatEUR } from '../utils/format.js'
import { hardRefresh } from '../utils/hard-refresh.js'

export function mountHeader (rootEl) {
  function render () {
    const profile = store.profile
    const username = profile?.username || '—'
    const level = profile?.level || 1
    const balance = profile?.balance != null ? formatEUR(profile.balance) : '—'
    const lang = getLang()

    rootEl.innerHTML = htmlRaw`
      <div class="container header-content">
        <div class="header-brand">PROPHET</div>
        <div class="header-meta">
          <span class="truncate" style="max-width:80px">${escHTML(username)}</span>
          <span class="level-chip">${escHTML(t('header.level', { n: level }))}</span>
          <span class="text-gold" style="font-family:var(--font-mono);font-weight:700">${escHTML(balance)}</span>
          <button id="btn-hard-refresh" class="hr-btn" title="${lang === 'fr' ? 'Forcer le rafraîchissement' : 'Hard refresh'}" aria-label="hard refresh">
            <span aria-hidden="true">↻</span>
          </button>
        </div>
      </div>
    `

    rootEl.querySelector('#btn-hard-refresh')?.addEventListener('click', onHardRefresh)
  }

  async function onHardRefresh (e) {
    const btn = e.currentTarget
    btn.classList.add('spinning')
    btn.disabled = true
    try {
      await hardRefresh()
    } finally {
      // hardRefresh provoque un reload, mais en cas d'échec on restaure le bouton
      setTimeout(() => {
        btn.classList.remove('spinning')
        btn.disabled = false
      }, 1500)
    }
  }

  render()
  store.on('profile', render)
  window.addEventListener('lang-changed', render)
  return render
}
