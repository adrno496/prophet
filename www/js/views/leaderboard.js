// ============================================================================
// PROPHET — Leaderboard view
// 4 onglets : Balance · ROI · Winrate · Sharpe
// Refresh côté serveur every 5 min (cron update_leaderboards)
// ============================================================================

import { fetchLeaderboard, fetchTopActivePlayers } from '../api/leaderboard.js'
import { store } from '../state.js'
import { t, getLang } from '../i18n/index.js'
import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { formatEUR, formatPct } from '../utils/format.js'

const TABS = [
  { id: 'balance', label_fr: 'Solde',  label_en: 'Balance', unit: '€' },
  { id: 'roi',     label_fr: 'ROI',    label_en: 'ROI',     unit: '%' },
  { id: 'winrate', label_fr: 'Winrate',label_en: 'Win rate',unit: '%' },
  { id: 'sharpe',  label_fr: 'Sharpe', label_en: 'Sharpe',  unit: '' }
]

function medal (rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return ''
}

function formatValue (rankType, value) {
  if (value == null) return '—'
  if (rankType === 'balance' || rankType === 'sharpe') return formatEUR(value)
  if (rankType === 'roi' || rankType === 'winrate') return formatPct(value, 1)
  return String(value)
}

export function mountLeaderboard (rootEl) {
  let activeTab = 'balance'
  let rows = []

  function render () {
    const lang = getLang()
    const meId = store.user?.id

    rootEl.innerHTML = htmlRaw`
      <div class="container stack-4">

        <div class="row" style="overflow-x:auto;flex-wrap:nowrap;gap:var(--sp-2);scrollbar-width:none">
          ${TABS.map(tab => htmlRaw`
            <button
              class="badge ${tab.id === activeTab ? 'badge-up' : ''}"
              data-rank="${escHTML(tab.id)}"
              style="white-space:nowrap;padding:var(--sp-2) var(--sp-3);cursor:pointer;font-size:var(--fs-sm)"
            >${escHTML(lang === 'fr' ? tab.label_fr : tab.label_en)}</button>
          `).join('')}
        </div>

        <div id="lb-list" class="stack-2"></div>

        <div class="text-mute" style="text-align:center;font-size:var(--fs-xs)">
          ${lang === 'fr' ? '🔄 Mise à jour toutes les 5 minutes' : '🔄 Updated every 5 minutes'}
        </div>

      </div>
    `

    rootEl.querySelectorAll('[data-rank]').forEach(b => {
      b.addEventListener('click', async () => {
        activeTab = b.getAttribute('data-rank')
        render()
        await loadTab()
      })
    })

    renderList()
  }

  function renderList () {
    const list = rootEl.querySelector('#lb-list')
    if (!list) return
    const lang = getLang()
    const meId = store.user?.id

    if (rows.length === 0) {
      list.innerHTML = htmlRaw`
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <div>${lang === 'fr' ? 'Pas encore assez de joueurs' : 'Not enough players yet'}</div>
          <div class="empty-cta text-mute" style="font-size:var(--fs-xs);margin-top:var(--sp-2)">
            ${lang === 'fr' ? 'Reviens dans 5 minutes' : 'Come back in 5 minutes'}
          </div>
        </div>
      `
      return
    }

    // Podium top 3 (visuel)
    const top3 = rows.slice(0, 3)
    const rest = rows.slice(3)
    const podiumHtml = top3.length >= 3 ? htmlRaw`
      <div class="podium">
        <div class="podium-step podium-step--2">
          <div class="podium-medal">🥈</div>
          <div class="podium-name">${escHTML(top3[1].username)}</div>
          <div class="podium-value">${escHTML(formatValue(activeTab, top3[1].value))}</div>
        </div>
        <div class="podium-step podium-step--1">
          <div class="podium-medal">🥇</div>
          <div class="podium-name">${escHTML(top3[0].username)}</div>
          <div class="podium-value">${escHTML(formatValue(activeTab, top3[0].value))}</div>
        </div>
        <div class="podium-step podium-step--3">
          <div class="podium-medal">🥉</div>
          <div class="podium-name">${escHTML(top3[2].username)}</div>
          <div class="podium-value">${escHTML(formatValue(activeTab, top3[2].value))}</div>
        </div>
      </div>
    ` : ''

    list.innerHTML = podiumHtml + rest.map(r => {
      const isMe = meId && r.user_id === meId
      const m = medal(r.rank)
      return htmlRaw`
        <div class="card row-between" style="${isMe ? 'border-color:var(--gold);background:rgba(255,181,71,0.04)' : ''}">
          <div class="row" style="gap:var(--sp-3);min-width:0">
            <span style="font-family:var(--font-mono);font-weight:700;width:32px;text-align:right">
              ${m || '#' + escHTML(r.rank)}
            </span>
            <span class="truncate" style="font-weight:${isMe ? '800' : '600'}">${escHTML(r.username)}${isMe ? ' (' + (lang === 'fr' ? 'toi' : 'you') + ')' : ''}</span>
          </div>
          <span class="market-price ${activeTab === 'balance' || activeTab === 'sharpe' ? 'text-gold' : ''}">${escHTML(formatValue(activeTab, r.value))}</span>
        </div>
      `
    }).join('')
  }

  async function loadTab () {
    rows = await fetchLeaderboard(activeTab, 100)
    // Fallback : si le cache leaderboard_cache est vide, on tape directement profiles pour balance
    if (rows.length === 0 && activeTab === 'balance') {
      const fallback = await fetchTopActivePlayers(50)
      rows = fallback.map((p, i) => ({
        rank: i + 1,
        user_id: p.id,
        username: p.username,
        value: p.balance
      }))
    }
    renderList()
  }

  render()
  loadTab()
  window.addEventListener('lang-changed', render)

  return () => {
    window.removeEventListener('lang-changed', render)
  }
}
