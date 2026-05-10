// ============================================================================
// PROPHET — API: positions
// Fetch positions (open + history) + abonnement Realtime
// ============================================================================

import { sb } from '../supabase-client.js'
import { store } from '../state.js'

export async function fetchOpenPositions () {
  const userId = store.user?.id
  if (!userId) return []
  const { data, error } = await sb
    .from('positions')
    .select('id, market_id, side, stake, leverage, entry_price, exposure, exit_price, move_pct, pnl, status, created_at, resolved_at')
    .eq('user_id', userId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
  if (error) {
    console.warn('fetchOpenPositions error', error)
    return []
  }
  return data || []
}

export async function fetchPositionHistory (limit = 30) {
  const userId = store.user?.id
  if (!userId) return []
  const { data, error } = await sb
    .from('positions')
    .select('id, market_id, side, stake, leverage, entry_price, exposure, exit_price, move_pct, pnl, status, created_at, resolved_at')
    .eq('user_id', userId)
    .neq('status', 'open')
    .order('resolved_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) {
    console.warn('fetchPositionHistory error', error)
    return []
  }
  return data || []
}

let positionsChannel = null
export function subscribeToOwnPositions () {
  const userId = store.user?.id
  if (!userId || positionsChannel) return positionsChannel

  positionsChannel = sb
    .channel('positions-' + userId)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'positions', filter: `user_id=eq.${userId}` },
      (payload) => {
        // Le payload contient { eventType, new, old } — utile pour détecter
        // les transitions 'open' → 'won'/'lost'/'liquidated' (celebration).
        window.dispatchEvent(new CustomEvent('positions-changed', { detail: payload }))
      }
    )
    .subscribe()
  return positionsChannel
}

export function unsubscribeFromOwnPositions () {
  if (positionsChannel) {
    sb.removeChannel(positionsChannel)
    positionsChannel = null
  }
}
