// ============================================================================
// PULSE PREDICT — Resolution ticket (proof-of-resolution)
// Modal qui affiche la preuve de résolution d'une position : prix open/close,
// timestamps UTC, source vérifiable, P&L détaillé.
// ============================================================================

import { sb } from '../supabase-client.js'
import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { formatEUR, formatPrice, formatPct } from '../utils/format.js'
import { getLang } from '../i18n/index.js'

const SOURCE_URLS = {
  cg: (apiId) => `https://www.coingecko.com/en/coins/${apiId}`,
  fh: (apiId) => `https://finnhub.io/quote/${apiId}`,
  td: (apiId) => `https://www.tradingview.com/symbols/${encodeURIComponent(apiId)}/`,
  fred: (apiId) => `https://fred.stlouisfed.org/series/${apiId}`
}

export async function showResolutionTicket (positionId) {
  if (!positionId) return

  // Fetch full data : position + market + asset
  const { data: pos, error: posErr } = await sb
    .from('positions')
    .select('id, side, stake, leverage, entry_price, exit_price, move_pct, pnl, status, created_at, resolved_at, market_id')
    .eq('id', positionId)
    .single()
  if (posErr || !pos) {
    console.warn('[ticket] position not found', posErr)
    return
  }

  const { data: market } = await sb
    .from('markets')
    .select('id, asset_id, market_type, timeframe_minutes, question, opens_at, stakes_close_at, resolves_at, price_open, price_close, outcome, status')
    .eq('id', pos.market_id)
    .single()

  let asset = null
  if (market?.asset_id) {
    const { data: a } = await sb
      .from('assets')
      .select('id, name, symbol, category, api_source, api_id')
      .eq('id', market.asset_id)
      .single()
    asset = a
  }

  renderTicket({ position: pos, market, asset })
}

function renderTicket ({ position, market, asset }) {
  const lang = getLang()
  const isWin = position.status === 'won'
  const isLoss = position.status === 'lost' || position.status === 'liquidated'
  const isCancelled = position.status === 'cancelled'

  const sourceUrl = asset?.api_source && SOURCE_URLS[asset.api_source]
    ? SOURCE_URLS[asset.api_source](asset.api_id)
    : null

  const pnlSign = (position.pnl || 0) >= 0 ? '+' : ''
  const movePct = position.move_pct
  const moveSign = (movePct || 0) >= 0 ? '+' : ''

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay show'
  overlay.style.zIndex = '350'
  overlay.style.overflowY = 'auto'

  const card = document.createElement('div')
  card.className = 'rt-card'
  card.innerHTML = htmlRaw`
    <button id="rt-close" class="rt-close" aria-label="close">✕</button>

    <div class="rt-header rt-header--${escHTML(position.status)}">
      <div class="rt-emoji">
        ${isWin ? '🎉' : isLoss ? '💀' : isCancelled ? '↩️' : '⏳'}
      </div>
      <div class="rt-title">
        ${isWin
          ? (lang === 'fr' ? 'PRÉDICTION CORRECTE' : 'CORRECT PREDICTION')
          : isLoss
            ? (position.status === 'liquidated' ? 'LIQUIDATION' : (lang === 'fr' ? 'PRÉDICTION INCORRECTE' : 'INCORRECT'))
            : isCancelled
              ? (lang === 'fr' ? 'MARCHÉ ANNULÉ' : 'MARKET CANCELLED')
              : (lang === 'fr' ? 'EN COURS' : 'PENDING')}
      </div>
      <div class="rt-amount ${isWin ? 'text-up' : isLoss ? 'text-down' : 'text-mute'}">
        ${pnlSign}${escHTML(formatEUR(position.pnl ?? 0))}
      </div>
    </div>

    <div class="rt-rows">
      <div class="rt-row">
        <span class="rt-label">${lang === 'fr' ? 'Marché' : 'Market'}</span>
        <span class="rt-value">${escHTML(asset?.symbol || asset?.id || market?.asset_id || '?')}
          ${market?.timeframe_minutes ? ' · ' + escHTML(formatTf(market.timeframe_minutes, lang)) : ''}
        </span>
      </div>

      <div class="rt-row">
        <span class="rt-label">${lang === 'fr' ? 'Prédiction' : 'Pick'}</span>
        <span class="rt-value ${position.side === 'UP' || position.side === 'YES' ? 'text-up' : 'text-down'}">
          ${escHTML(position.side)}${position.leverage > 1 ? ' × ' + position.leverage : ''}
        </span>
      </div>

      <div class="rt-row">
        <span class="rt-label">${lang === 'fr' ? 'Mise' : 'Stake'}</span>
        <span class="rt-value">${escHTML(formatEUR(position.stake))}</span>
      </div>

      <div class="rt-row">
        <span class="rt-label">${lang === 'fr' ? 'Prix d\'entrée' : 'Entry price'}</span>
        <span class="rt-value">${escHTML(position.entry_price ? formatPrice(position.entry_price, asset?.category) : '—')}</span>
      </div>
      <div class="rt-row rt-row--sub">
        <span class="rt-label">${lang === 'fr' ? 'Ouverture' : 'Opened'}</span>
        <span class="rt-value-sm">${escHTML(formatUtc(position.created_at))}</span>
      </div>

      <div class="rt-row">
        <span class="rt-label">${lang === 'fr' ? 'Prix de sortie' : 'Exit price'}</span>
        <span class="rt-value">${escHTML(position.exit_price ? formatPrice(position.exit_price, asset?.category) : '—')}</span>
      </div>
      <div class="rt-row rt-row--sub">
        <span class="rt-label">${lang === 'fr' ? 'Résolution' : 'Resolved'}</span>
        <span class="rt-value-sm">${escHTML(position.resolved_at ? formatUtc(position.resolved_at) : '—')}</span>
      </div>

      ${movePct != null ? htmlRaw`
        <div class="rt-row">
          <span class="rt-label">${lang === 'fr' ? 'Mouvement' : 'Move'}</span>
          <span class="rt-value ${movePct >= 0 ? 'text-up' : 'text-down'}">${moveSign}${escHTML(formatPct(movePct))}</span>
        </div>
      ` : ''}

      <div class="rt-row rt-row--highlight">
        <span class="rt-label">P&L</span>
        <span class="rt-value ${(position.pnl || 0) >= 0 ? 'text-up' : 'text-down'}">
          ${pnlSign}${escHTML(formatEUR(position.pnl ?? 0))}
        </span>
      </div>
    </div>

    <div class="rt-source">
      ${lang === 'fr' ? 'Source vérifiable' : 'Verifiable source'} :
      ${sourceUrl
        ? htmlRaw`<a href="${escHTML(sourceUrl)}" target="_blank" rel="noopener" class="rt-link">
            ${escHTML(asset?.api_source === 'cg' ? 'CoinGecko' : asset?.api_source === 'fh' ? 'Finnhub' : asset?.api_source === 'td' ? 'TradingView' : 'External')} →
          </a>`
        : '<span class="text-mute">internal</span>'}
    </div>

    <div class="rt-id text-mute">
      ID position : <code>${escHTML(position.id.slice(0, 8))}…</code>
    </div>
  `

  overlay.appendChild(card)
  document.body.appendChild(overlay)

  const close = () => {
    overlay.classList.remove('show')
    setTimeout(() => overlay.remove(), 200)
  }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
  card.querySelector('#rt-close').addEventListener('click', close)
}

function formatTf (mins, lang) {
  if (mins >= 1440) return `${mins / 1440}j`
  if (mins >= 60) return `${mins / 60}h`
  return `${mins}min`
}

function formatUtc (iso) {
  if (!iso) return '—'
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}
