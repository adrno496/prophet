// ============================================================================
// PROPHET — API: achievements
// Lecture des badges débloqués + RPC check_achievements
// ============================================================================

import { sb } from '../supabase-client.js'
import { store } from '../state.js'

export const ACHIEVEMENTS_META = {
  first_blood: { icon: '🩸', label_fr: 'Premier sang',     label_en: 'First Blood',    desc_fr: 'Premier trade ouvert',           desc_en: 'First trade placed' },
  first_win:   { icon: '🎯', label_fr: 'Première victoire',label_en: 'First Win',      desc_fr: 'Première position gagnante',     desc_en: 'First winning position' },
  win_5:       { icon: '🔥', label_fr: 'En feu',           label_en: 'On Fire',        desc_fr: '5 victoires',                    desc_en: '5 wins' },
  centurion:   { icon: '💯', label_fr: 'Centurion',        label_en: 'Centurion',      desc_fr: '100 trades',                     desc_en: '100 trades' },
  high_roller: { icon: '💎', label_fr: 'High Roller',      label_en: 'High Roller',    desc_fr: 'Peak ≥ €5 000',                  desc_en: 'Peak ≥ €5,000' },
  millionaire: { icon: '👑', label_fr: 'Millionnaire',     label_en: 'Millionaire',    desc_fr: 'Peak ≥ €1M',                     desc_en: 'Peak ≥ €1M' },
  phoenix:     { icon: '🔥', label_fr: 'Phénix',           label_en: 'Phoenix',        desc_fr: 'Liquidé puis revenu',            desc_en: 'Liquidated and bounced back' },
  level_5:     { icon: '⭐', label_fr: 'Niveau 5',         label_en: 'Level 5',        desc_fr: 'Atteint le niveau 5',            desc_en: 'Reached level 5' },
  level_10:    { icon: '🌟', label_fr: 'Niveau 10',        label_en: 'Level 10',       desc_fr: 'Atteint le niveau 10',           desc_en: 'Reached level 10' }
}

export async function fetchOwnAchievements () {
  const userId = store.user?.id
  if (!userId) return []
  const { data, error } = await sb
    .from('achievements')
    .select('code, unlocked_at')
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false })
  if (error) {
    console.warn('fetchOwnAchievements error', error)
    return []
  }
  return data || []
}

export async function checkAchievements () {
  const { data, error } = await sb.rpc('check_achievements')
  if (error) {
    console.warn('checkAchievements error', error)
    return 0
  }
  return Number(data) || 0
}
