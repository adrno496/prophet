// ============================================================================
// PULSE PREDICT — API : profile charts data
// Helpers pour les graphes du profil : balance history + AI accuracy
// ============================================================================

import { sb } from '../supabase-client.js'

export async function fetchMyBalanceHistory (days = 30) {
  const { data, error } = await sb.rpc('my_balance_history', { p_days: days })
  if (error) {
    console.warn('[profile-charts] balance history error', error)
    return []
  }
  return (data || []).map(r => ({ ts: r.ts, balance: Number(r.balance) }))
}

export async function fetchAIAccuracyByDay (days = 14) {
  const { data, error } = await sb.rpc('ai_accuracy_by_day', { p_days: days })
  if (error) {
    console.warn('[profile-charts] AI accuracy error', error)
    return []
  }
  return (data || []).map(r => ({
    date: r.date,
    correct: Number(r.correct) || 0,
    incorrect: Number(r.incorrect) || 0
  }))
}

export async function fetchAIPredictionsHistory (limit = 50) {
  const { data, error } = await sb.rpc('ai_predictions_history', { p_limit: limit })
  if (error) {
    console.warn('[profile-charts] AI history error', error)
    return []
  }
  return data || []
}
