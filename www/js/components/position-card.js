// ============================================================================
// PROPHET — Position card component
// Affiche une position : asset · side · levier · stake · entry · exit · PnL
// ============================================================================

import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { formatEUR, formatPrice, formatPct } from '../utils/format.js'
import { startCountdown } from './countdown.js'
import { getLang } from '../i18n/index.js'

const STATUS_BADGE = {
  open:        { fr: 'Ouverte',     en: 'Open',        cls: 'badge-gold' },
  won:         { fr: 'Gagnée',      en: 'Won',         cls: 'badge-up' },
  lost:        { fr: 'Perdue',      en: 'Lost',        cls: 'badge-down' },
  liquidated:  { fr: 'Liquidée',    en: 'Liquidated',  cls: 'badge-down' },
  cancelled:   { fr: 'Annulée',     en: 'Cancelled',   cls: 'badge' }
}

// position : { id, side, stake, leverage, entry_price, exit_price, move_pct, pnl, status, created_at, resolved_at }
// market : { id, asset_id, timeframe_minutes, resolves_at, price_open, price_close, status }
// asset : { id, symbol, name, category }
export function renderPositionCard ({ position, market, asset }) {
  const lang = getLang()
  const sb = STATUS_BADGE[position.status] || STATUS_BADGE.open
  const sideClass = position.side === 'UP' || position.side === 'YES' ? 'text-up' : 'text-down'
  const arrow = position.side === 'UP' || position.side === 'YES' ? '▲' : '▼'

  const card = document.createElement('div')
  card.className = 'card'
  card.innerHTML = htmlRaw`
    <div class="row-between" style="margin-bottom:var(--sp-2)">
      <div class="row" style="gap:var(--sp-2);min-width:0">
        <span class="badge badge-cat-${escHTML(asset?.category || 'crypto')}">${escHTML(asset?.category || '?')}</span>
        <span style="font-weight:700">${escHTML(asset?.symbol || asset?.id || '?')}</span>
        <span class="${sideClass}" style="font-weight:700">${arrow} ${escHTML(position.side)}</span>
        <span class="lev-pill">${escHTML(position.leverage)}x</span>
      </div>
      <span class="badge ${sb.cls}">${escHTML(sb[lang])}</span>
    </div>

    <div class="grid-2" style="gap:var(--sp-2);font-size:var(--fs-sm)">
      <div class="stack" style="gap:0">
        <span class="text-mute" style="font-size:var(--fs-xs)">${lang === 'fr' ? 'Mise' : 'Stake'}</span>
        <span class="market-price">${escHTML(formatEUR(position.stake))}</span>
      </div>
      <div class="stack" style="gap:0">
        <span class="text-mute" style="font-size:var(--fs-xs)">${lang === 'fr' ? 'Exposition' : 'Exposure'}</span>
        <span class="market-price">${escHTML(formatEUR(position.stake * position.leverage))}</span>
      </div>
      <div class="stack" style="gap:0">
        <span class="text-mute" style="font-size:var(--fs-xs)">${lang === 'fr' ? 'Entrée' : 'Entry'}</span>
        <span class="market-price">${escHTML(position.entry_price ? formatPrice(position.entry_price, asset?.category) : '—')}</span>
      </div>
      <div class="stack" style="gap:0">
        <span class="text-mute" style="font-size:var(--fs-xs)">${lang === 'fr' ? 'Sortie' : 'Exit'}</span>
        <span class="market-price">${escHTML(position.exit_price ? formatPrice(position.exit_price, asset?.category) : '—')}</span>
      </div>
    </div>

    ${position.status === 'open'
      ? htmlRaw`
        <div class="row-between" style="margin-top:var(--sp-3);padding-top:var(--sp-3);border-top:1px solid var(--border)">
          <span class="text-mute" style="font-size:var(--fs-xs)">${lang === 'fr' ? 'Résolution dans' : 'Resolves in'}</span>
          <span class="market-price text-gold" id="cd-${escHTML(position.id)}">—</span>
        </div>
      `
      : htmlRaw`
        <div class="row-between" style="margin-top:var(--sp-3);padding-top:var(--sp-3);border-top:1px solid var(--border)">
          <div class="stack" style="gap:0">
            <span class="text-mute" style="font-size:var(--fs-xs)">${lang === 'fr' ? 'Mouvement' : 'Move'}</span>
            <span class="${(position.move_pct || 0) >= 0 ? 'text-up' : 'text-down'}" style="font-family:var(--font-mono)">
              ${escHTML(position.move_pct != null ? formatPct(position.move_pct) : '—')}
            </span>
          </div>
          <div class="stack" style="gap:0;text-align:right">
            <span class="text-mute" style="font-size:var(--fs-xs)">PnL</span>
            <span class="${(position.pnl || 0) >= 0 ? 'text-up' : 'text-down'}" style="font-family:var(--font-mono);font-weight:800;font-size:var(--fs-md)">
              ${escHTML(position.pnl != null ? (position.pnl >= 0 ? '+' : '') + formatEUR(position.pnl) : '—')}
            </span>
          </div>
        </div>
      `
    }
  `

  if (position.status === 'open' && market?.resolves_at) {
    const cdEl = card.querySelector(`#cd-${CSS.escape(position.id)}`)
    if (cdEl) startCountdown(cdEl, market.resolves_at)
  }

  return card
}
