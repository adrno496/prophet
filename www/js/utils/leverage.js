// ============================================================================
// PROPHET — leverage helpers (Phase 4)
// Calculs marge / liquidation / PnL côté client (preview UI uniquement)
// La VRAIE source de vérité reste les fonctions SQL serveur (anti-cheat).
// ============================================================================

// Levier max autorisé selon niveau (réplique de la logique SQL)
export function maxLeverage (level) {
  if (level >= 10) return 10
  if (level >= 5) return 5
  return 2
}

// Exposition = stake × levier
export function exposure (stake, leverage) {
  return Math.round(stake * leverage * 100) / 100
}

// PnL preview avant résolution (réplique de la logique resolve_position)
// won = true/false ; movePct = (price_close - price_open) / price_open * 100
export function calcPnL ({ stake, leverage, won, movePct }) {
  if (!won) return -stake
  const moveBonus = Math.min(Math.abs(movePct || 0) / 5, 1)
  return Math.round(stake * leverage * 0.95 * (1 + moveBonus * 0.5) * 100) / 100
}

// Prix de liquidation indicatif (positions levier > 1x)
// Liquidé quand equity < 10% marge → mouvement défavorable de (90% / leverage)
export function liquidationPrice ({ side, entryPrice, leverage }) {
  if (!entryPrice || leverage <= 1) return null
  const liqMovePct = 0.9 / leverage
  if (side === 'UP' || side === 'YES') {
    return entryPrice * (1 - liqMovePct)
  } else {
    return entryPrice * (1 + liqMovePct)
  }
}

// Funding fee (par heure, sur exposition, pour leverage >= 3x)
export function fundingFeePerHour (exposureValue, leverage) {
  if (leverage < 3) return 0
  return Math.round(exposureValue * 0.0005 * 100) / 100
}
