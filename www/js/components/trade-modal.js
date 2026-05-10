// ============================================================================
// PROPHET — Trade modal (bottom-sheet)
// Sliders stake + leverage, prédiction live, boutons UP/DOWN, place_bet RPC
// ============================================================================

import { store, loadProfile } from '../state.js'
import { placeBet } from '../api/markets.js'
import { t, getLang } from '../i18n/index.js'
import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { formatEUR, formatPrice } from '../utils/format.js'
import { exposure, calcPnL, maxLeverage, liquidationPrice, fundingFeePerHour } from '../utils/leverage.js'
import { startCountdown } from './countdown.js'
import { toast } from './toast.js'

const TF_LABELS = {
  15: '15 min',
  30: '30 min',
  60: '1 h',
  240: '4 h',
  480: '8 h',
  1440: '24 h'
}

let modalEls = null
let countdownStop = null

function ensureModal () {
  if (modalEls && document.body.contains(modalEls.overlay)) return modalEls
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.addEventListener('click', closeTradeModal)
  const sheet = document.createElement('div')
  sheet.className = 'modal-sheet'
  sheet.addEventListener('click', e => e.stopPropagation())
  document.body.appendChild(overlay)
  document.body.appendChild(sheet)
  modalEls = { overlay, sheet }
  return modalEls
}

export function openTradeModal ({ asset, market, price, presetSide }) {
  if (!market) {
    toast.info(getLang() === 'fr'
      ? 'Aucun marché ouvert pour cette échéance (cron pas encore déclenché)'
      : 'No open market for this timeframe yet (cron not triggered yet)')
    return
  }

  const { sheet, overlay } = ensureModal()
  const profile = store.profile
  if (!profile) {
    toast.error(t('toast.error_auth'))
    return
  }
  const balance = Number(profile.balance) || 0
  const userLev = maxLeverage(profile.level || 1)
  const isEvent = market.market_type === 'event'

  let stake = Math.min(50, Math.floor(balance / 4))
  if (stake < 10) stake = balance >= 10 ? 10 : 0
  let leverage = 1

  function render () {
    const lang = getLang()
    const exp = exposure(stake, leverage)
    const pnlWin = calcPnL({ stake, leverage, won: true, movePct: 1 })
    const pnlLoss = -stake
    const liq = leverage > 1 && market.price_open
      ? liquidationPrice({ side: 'UP', entryPrice: market.price_open, leverage })
      : null
    const fund = fundingFeePerHour(exp, leverage)

    sheet.innerHTML = htmlRaw`
      <div class="modal-handle"></div>

      <div class="row-between" style="margin-bottom:var(--sp-3)">
        <div class="stack" style="gap:0">
          <div style="font-weight:800;font-size:var(--fs-lg);line-height:1.2">${escHTML(isEvent ? (market.question || market.topic || asset.name) : asset.name)}</div>
          <div class="text-mute" style="font-size:var(--fs-xs)">
            ${isEvent
              ? escHTML(market.outcome_label || market.subtitle || market.topic || '')
              : escHTML(TF_LABELS[market.timeframe_minutes] || '?')}
          </div>
        </div>
        <button class="btn-link" id="trade-close" aria-label="Close">✕</button>
      </div>

      ${isEvent ? '' : htmlRaw`
        <div class="card-elevated card row-between" style="margin-bottom:var(--sp-4)">
          <div class="stack" style="gap:0">
            <div class="text-mute" style="font-size:var(--fs-xs)">${lang === 'fr' ? 'Prix actuel' : 'Current price'}</div>
            <div class="market-price" style="font-size:var(--fs-xl)">${escHTML(formatPrice(price?.price ?? market.price_open, asset.category))}</div>
          </div>
          <div class="stack" style="gap:0;text-align:right">
            <div class="text-mute" style="font-size:var(--fs-xs)">${lang === 'fr' ? 'Verrouillage' : 'Locks'}</div>
            <div class="market-price" id="trade-lock-cd" style="color:var(--gold)">—</div>
          </div>
        </div>
      `}
      ${isEvent ? htmlRaw`
        <div class="card-elevated card row-between" style="margin-bottom:var(--sp-4)">
          <div class="stack" style="gap:0">
            <div class="text-mute" style="font-size:var(--fs-xs)">${lang === 'fr' ? 'Échéance' : 'Resolves in'}</div>
            <div class="market-price" id="trade-lock-cd" style="font-size:var(--fs-md);color:var(--gold)">—</div>
          </div>
          <div class="stack" style="gap:0;text-align:right">
            <div class="text-mute" style="font-size:var(--fs-xs)">${lang === 'fr' ? 'Volume' : 'Volume'}</div>
            <div class="market-price">${escHTML(formatEUR(Number(market.total_up_stakes||0) + Number(market.total_down_stakes||0)))}</div>
          </div>
        </div>
      ` : ''}

      <div class="stack-3" style="margin-bottom:var(--sp-4)">
        <div class="row-between">
          <span style="font-weight:700">${lang === 'fr' ? 'Mise' : 'Stake'}</span>
          <span class="market-price text-gold">${escHTML(formatEUR(stake))}</span>
        </div>
        <input id="slider-stake" type="range" class="slider" min="10" max="${Math.max(10, Math.floor(balance))}" step="10" value="${stake}" />
        <div class="row-between text-mute" style="font-size:var(--fs-xs)">
          <span>€10</span>
          <span>${escHTML(formatEUR(balance))}</span>
        </div>
      </div>

      <div class="stack-3" style="margin-bottom:var(--sp-4)">
        <div class="row-between">
          <span style="font-weight:700">${lang === 'fr' ? 'Levier' : 'Leverage'}</span>
          <span class="lev-pill text-up">${leverage}x</span>
        </div>
        <input id="slider-lev" type="range" class="slider" min="1" max="${userLev}" step="1" value="${leverage}" />
        <div class="row-between text-mute" style="font-size:var(--fs-xs)">
          <span>1x</span>
          <span>Max ${userLev}x ${userLev < 10 ? '🔒' : ''}</span>
        </div>
      </div>

      <div class="card stack-2" style="margin-bottom:var(--sp-4);font-size:var(--fs-sm)">
        <div class="row-between"><span class="text-mute">${lang === 'fr' ? 'Exposition' : 'Exposure'}</span><span class="market-price">${escHTML(formatEUR(exp))}</span></div>
        <div class="row-between"><span class="text-mute">${lang === 'fr' ? 'Gain potentiel' : 'Potential win'}</span><span class="market-price text-up">+${escHTML(formatEUR(pnlWin))}</span></div>
        <div class="row-between"><span class="text-mute">${lang === 'fr' ? 'Perte max' : 'Max loss'}</span><span class="market-price text-down">${escHTML(formatEUR(pnlLoss))}</span></div>
        ${liq ? htmlRaw`<div class="row-between"><span class="text-mute">${lang === 'fr' ? 'Liquidation ≈' : 'Liquidation ≈'}</span><span class="market-price text-down">${escHTML(formatPrice(liq, asset.category))}</span></div>` : ''}
        ${fund > 0 ? htmlRaw`<div class="row-between"><span class="text-mute">${lang === 'fr' ? 'Funding/h' : 'Funding/h'}</span><span class="market-price text-down">-${escHTML(formatEUR(fund))}</span></div>` : ''}
      </div>

      <div class="grid-2" style="gap:var(--sp-3)">
        ${isEvent ? htmlRaw`
          <button class="btn btn-up btn-block ${presetSide === 'YES' ? 'preset' : ''}" id="trade-up">${lang === 'fr' ? '✅ OUI' : '✅ YES'}</button>
          <button class="btn btn-down btn-block ${presetSide === 'NO' ? 'preset' : ''}" id="trade-down">${lang === 'fr' ? '❌ NON' : '❌ NO'}</button>
        ` : htmlRaw`
          <button class="btn btn-up btn-block ${presetSide === 'UP' ? 'preset' : ''}" id="trade-up">▲ UP</button>
          <button class="btn btn-down btn-block ${presetSide === 'DOWN' ? 'preset' : ''}" id="trade-down">▼ DOWN</button>
        `}
      </div>
    `

    // Sliders
    sheet.querySelector('#slider-stake').addEventListener('input', e => {
      stake = Number(e.target.value)
      render()
    })
    sheet.querySelector('#slider-lev').addEventListener('input', e => {
      leverage = Number(e.target.value)
      render()
    })

    sheet.querySelector('#trade-close').addEventListener('click', closeTradeModal)
    sheet.querySelector('#trade-up').addEventListener('click', () => submit(isEvent ? 'YES' : 'UP'))
    sheet.querySelector('#trade-down').addEventListener('click', () => submit(isEvent ? 'NO' : 'DOWN'))

    // Countdown sur stakes_close_at (directional) ou resolves_at (event)
    const cdEl = sheet.querySelector('#trade-lock-cd')
    if (countdownStop) countdownStop()
    if (cdEl) {
      const target = isEvent ? market.resolves_at : market.stakes_close_at
      countdownStop = startCountdown(cdEl, target, () => {
        toast.info(getLang() === 'fr' ? 'Marché verrouillé' : 'Market locked')
        closeTradeModal()
      })
    }
  }

  async function submit (side) {
    const upBtn = sheet.querySelector('#trade-up')
    const downBtn = sheet.querySelector('#trade-down')
    upBtn.disabled = true
    downBtn.disabled = true
    try {
      await placeBet({ marketId: market.id, side, stake, leverage })
      const lang = getLang()
      toast.success(lang === 'fr'
        ? `Position ${side} ouverte · ${formatEUR(stake)} · ${leverage}x`
        : `${side} position opened · ${formatEUR(stake)} · ${leverage}x`)
      await loadProfile()
      window.dispatchEvent(new CustomEvent('positions-changed'))
      closeTradeModal()
    } catch (e) {
      toast.error(e.message || t('toast.error_generic'))
      upBtn.disabled = false
      downBtn.disabled = false
    }
  }

  render()
  requestAnimationFrame(() => {
    overlay.classList.add('show')
    sheet.classList.add('show')
  })
}

export function closeTradeModal () {
  if (!modalEls) return
  modalEls.overlay.classList.remove('show')
  modalEls.sheet.classList.remove('show')
  if (countdownStop) {
    countdownStop()
    countdownStop = null
  }
}
