// ============================================================================
// PULSE PREDICT — API : AI Coach
// Lit les prédictions IA du jour (vue todays_ai_predictions) + soumet de
// nouvelles prédictions générées localement par l'utilisateur.
// ============================================================================

import { sb } from '../supabase-client.js'

export async function fetchTodayAIPredictions () {
  const { data, error } = await sb
    .from('todays_ai_predictions')
    .select('id, market_type, reference_id, ai_pick, ai_confidence, ai_reasoning, outcome, created_at')
  if (error) {
    console.warn('[ai-coach] fetch error', error)
    return []
  }
  return data || []
}

export async function submitAIPrediction ({ marketId, pick, confidence, reasoning }) {
  const { data, error } = await sb.rpc('submit_ai_prediction', {
    p_market_id: marketId,
    p_pick: pick,
    p_confidence: confidence,
    p_reasoning: reasoning
  })
  if (error) throw error
  return data // UUID
}

export async function fetchAICoachStats () {
  const { data, error } = await sb.rpc('ai_coach_stats')
  if (error) {
    console.warn('[ai-coach] stats error', error)
    return null
  }
  return data
}
