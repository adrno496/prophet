// ============================================================================
// PROPHET — Bottom tabs component
// 5 onglets : Home / Markets / Positions / Top / Profile
// ============================================================================

import { t } from '../i18n/index.js'
import { escHTML, htmlRaw } from '../utils/escHTML.js'

const TABS = [
  { id: 'home',        icon: '🏠', labelKey: 'tabs.home' },
  { id: 'markets',     icon: '📈', labelKey: 'tabs.markets' },
  { id: 'positions',   icon: '⚡', labelKey: 'tabs.positions' },
  { id: 'leaderboard', icon: '🏆', labelKey: 'tabs.leaderboard' },
  { id: 'profile',     icon: '👤', labelKey: 'tabs.profile' }
]

export function mountTabs (rootEl, { onChange, current = 'home' } = {}) {
  let active = current

  function render () {
    rootEl.innerHTML = htmlRaw`
      <nav class="tabs-list" role="tablist">
        ${TABS.map(tab => htmlRaw`
          <button
            class="tab-item ${tab.id === active ? 'active' : ''}"
            role="tab"
            data-tab="${escHTML(tab.id)}"
            aria-selected="${tab.id === active}"
          >
            <span class="tab-icon" aria-hidden="true">${tab.icon}</span>
            <span>${escHTML(t(tab.labelKey))}</span>
          </button>
        `).join('')}
      </nav>
    `

    rootEl.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-tab')
        if (id !== active) {
          active = id
          render()
          onChange?.(id)
        }
      })
    })
  }

  render()
  window.addEventListener('lang-changed', render)

  return {
    setActive: (id) => {
      if (id !== active) {
        active = id
        render()
      }
    }
  }
}
