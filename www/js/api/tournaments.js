// ============================================================================
// PULSE PREDICT — API : tournaments
// ============================================================================

import { sb } from '../supabase-client.js'

export async function fetchCurrentTournament () {
  const { data, error } = await sb.rpc('current_tournament')
  if (error) {
    console.warn('[tournaments] current error', error)
    return null
  }
  return data
}

export async function fetchTournamentLeaderboard (tournamentId, limit = 50) {
  const { data, error } = await sb.rpc('tournament_leaderboard', {
    p_tournament_id: tournamentId,
    p_limit: limit
  })
  if (error) {
    console.warn('[tournaments] leaderboard error', error)
    return []
  }
  return data || []
}

export async function enterTournament (tournamentId) {
  const { data, error } = await sb.rpc('enter_tournament', {
    p_tournament_id: tournamentId
  })
  if (error) throw error
  return data
}

export async function fetchMyTournamentEntry (tournamentId) {
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data } = await sb
    .from('tournament_entries')
    .select('id, current_pnl, rank, prize, entered_at')
    .eq('tournament_id', tournamentId)
    .eq('user_id', user.id)
    .maybeSingle()
  return data
}
