// ============================================================================
// PROPHET — API: leaderboard
// Lecture du cache leaderboard_cache (rebuild côté serveur toutes les 5 min)
// ============================================================================

import { sb } from '../supabase-client.js'

export async function fetchLeaderboard (rankType = 'balance', limit = 100) {
  const { data, error } = await sb
    .from('leaderboard_cache')
    .select('rank, user_id, username, value, updated_at')
    .eq('rank_type', rankType)
    .order('rank', { ascending: true })
    .limit(limit)
  if (error) {
    console.warn('fetchLeaderboard error', error)
    return []
  }
  return data || []
}

export async function fetchTopActivePlayers (limit = 10) {
  // Top par balance (proxy pour l'activité), si le cache n'est pas encore peuplé
  const { data, error } = await sb
    .from('profiles')
    .select('id, username, level, balance, total_trades, wins, losses, total_pnl')
    .order('balance', { ascending: false })
    .limit(limit)
  if (error) return []
  return data || []
}
