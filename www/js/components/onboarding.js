// ============================================================================
// PROPHET — Onboarding tour
// 4 étapes affichées une seule fois à la 1ère connexion (track via localStorage)
// ============================================================================

import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { getLang } from '../i18n/index.js'

const STORAGE_KEY = 'prophet.onboarded'

const STEPS_FR = [
  {
    icon: '🎁',
    title: '€1000 pour commencer',
    body: 'Capital virtuel offert. Aucun argent réel. 100% gratuit.'
  },
  {
    icon: '📈',
    title: '60+ marchés en direct',
    body: 'Cryptos, actions, indices, forex, VIX. Choisis UP ou DOWN sur 6 timeframes (15min → 24h).'
  },
  {
    icon: '⚡',
    title: 'Levier jusqu\'à 10x',
    body: 'Débloqué selon ton niveau. Attention à la liquidation si l\'equity tombe sous 10% de la marge.'
  },
  {
    icon: '🏆',
    title: 'Classement mondial',
    body: '4 onglets : solde, ROI, winrate, Sharpe. Refresh toutes les 5 minutes. Vise le top 100 !'
  }
]

const STEPS_EN = [
  {
    icon: '🎁',
    title: '€1,000 to start',
    body: 'Virtual capital granted. No real money. 100% free.'
  },
  {
    icon: '📈',
    title: '60+ live markets',
    body: 'Crypto, stocks, indices, forex, VIX. Pick UP or DOWN across 6 timeframes (15min → 24h).'
  },
  {
    icon: '⚡',
    title: 'Up to 10x leverage',
    body: 'Unlocked based on your level. Watch liquidation if equity falls below 10% of margin.'
  },
  {
    icon: '🏆',
    title: 'Global rankings',
    body: '4 tabs: balance, ROI, win rate, Sharpe. Updated every 5 minutes. Aim for top 100!'
  }
]

export function shouldShowOnboarding () {
  try {
    return !localStorage.getItem(STORAGE_KEY)
  } catch { return false }
}

export function showOnboarding (onClose) {
  let step = 0
  const lang = getLang()
  const STEPS = lang === 'fr' ? STEPS_FR : STEPS_EN

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const sheet = document.createElement('div')
  sheet.className = 'modal-sheet'

  function render () {
    const s = STEPS[step]
    const isLast = step === STEPS.length - 1
    sheet.innerHTML = htmlRaw`
      <div class="modal-handle"></div>

      <div style="text-align:center;padding:var(--sp-4) 0">
        <div style="font-size:64px;margin-bottom:var(--sp-3)">${s.icon}</div>
        <div style="font-size:var(--fs-xl);font-weight:800;margin-bottom:var(--sp-2)">${escHTML(s.title)}</div>
        <div class="text-mute" style="max-width:320px;margin:0 auto;line-height:1.6">${escHTML(s.body)}</div>
      </div>

      <div class="row" style="justify-content:center;gap:var(--sp-1);padding:var(--sp-3) 0">
        ${STEPS.map((_, i) => htmlRaw`
          <span style="width:8px;height:8px;border-radius:50%;background:${i === step ? 'var(--neon)' : 'var(--border-strong)'}"></span>
        `).join('')}
      </div>

      <div class="grid-2" style="gap:var(--sp-3);margin-top:var(--sp-4)">
        <button id="onb-skip" class="btn btn-ghost btn-block">
          ${lang === 'fr' ? 'Passer' : 'Skip'}
        </button>
        <button id="onb-next" class="btn btn-primary btn-block">
          ${isLast ? (lang === 'fr' ? 'GO ! 🚀' : 'GO! 🚀') : (lang === 'fr' ? 'Suivant →' : 'Next →')}
        </button>
      </div>
    `

    sheet.querySelector('#onb-skip').addEventListener('click', close)
    sheet.querySelector('#onb-next').addEventListener('click', () => {
      if (isLast) close()
      else { step += 1; render() }
    })
  }

  function close () {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch {}
    overlay.classList.remove('show')
    sheet.classList.remove('show')
    setTimeout(() => {
      overlay.remove()
      sheet.remove()
      onClose?.()
    }, 320)
  }

  document.body.appendChild(overlay)
  document.body.appendChild(sheet)
  render()
  requestAnimationFrame(() => {
    overlay.classList.add('show')
    sheet.classList.add('show')
  })
}
