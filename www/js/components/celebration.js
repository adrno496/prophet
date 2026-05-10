// ============================================================================
// PULSE PREDICT — Celebration (win popup + confetti)
// canvas-confetti via CDN dynamique (chargé seulement à la 1ère célébration)
// ============================================================================

import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { formatEUR } from '../utils/format.js'
import { hapticWin, hapticError } from '../utils/haptic.js'
import { getLang } from '../i18n/index.js'

let confettiPromise = null

// Charge canvas-confetti depuis le CDN une seule fois
async function loadConfetti () {
  if (window.confetti) return window.confetti
  if (confettiPromise) return confettiPromise
  confettiPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js'
    s.async = true
    s.onload = () => resolve(window.confetti)
    s.onerror = () => { confettiPromise = null; reject(new Error('confetti load failed')) }
    document.head.appendChild(s)
  })
  return confettiPromise
}

async function fireConfetti () {
  try {
    const confetti = await loadConfetti()
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#00E472', '#63CAFF', '#FFB547', '#A78BFA', '#FF3B5C']
    })
    // Burst latéraux
    setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0, y: 0.7 } }), 250)
    setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1, y: 0.7 } }), 400)
  } catch (_) { /* offline / CDN bloqué : pas grave */ }
}

export async function celebrateWin (amount) {
  const lang = getLang()
  hapticWin()
  fireConfetti() // fire-and-forget

  const popup = document.createElement('div')
  popup.className = 'celebrate-popup celebrate-win'
  popup.innerHTML = htmlRaw`
    <div class="celebrate-inner">
      <div class="celebrate-emoji">🎉</div>
      <div class="celebrate-label">${lang === 'fr' ? 'PRÉDICTION CORRECTE !' : 'CORRECT PREDICTION!'}</div>
      <div class="celebrate-amount">+${escHTML(formatEUR(amount))}</div>
    </div>
  `
  document.body.appendChild(popup)
  setTimeout(() => popup.classList.add('show'), 10)
  setTimeout(() => {
    popup.classList.remove('show')
    setTimeout(() => popup.remove(), 320)
  }, 2800)
}

export function celebrateLoss (amount) {
  const lang = getLang()
  hapticError()

  const popup = document.createElement('div')
  popup.className = 'celebrate-popup celebrate-loss'
  popup.innerHTML = htmlRaw`
    <div class="celebrate-inner">
      <div class="celebrate-emoji">💀</div>
      <div class="celebrate-label">${lang === 'fr' ? 'PRÉDICTION INCORRECTE' : 'INCORRECT'}</div>
      <div class="celebrate-amount text-down">−${escHTML(formatEUR(Math.abs(amount || 0)))}</div>
    </div>
  `
  document.body.appendChild(popup)
  setTimeout(() => popup.classList.add('show'), 10)
  setTimeout(() => {
    popup.classList.remove('show')
    setTimeout(() => popup.remove(), 320)
  }, 2200)
}
