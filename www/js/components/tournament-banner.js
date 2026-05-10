// ============================================================================
// PULSE PREDICT — Tournament banner
// Affiche le tournoi actif (ou prochain) avec entry fee + prize pool + CTA
// ============================================================================

import { fetchCurrentTournament, fetchMyTournamentEntry, enterTournament } from '../api/tournaments.js'
import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { formatEUR } from '../utils/format.js'
import { formatRelativeFromNow } from '../utils/format.js'
import { startCountdown } from './countdown.js'
import { getLang } from '../i18n/index.js'
import { toast } from './toast.js'
import { hapticImpact, hapticSuccess } from '../utils/haptic.js'

export async function mountTournamentBanner (rootEl) {
  const lang = getLang()
  let tournament = null
  let entry = null

  async function reload () {
    tournament = await fetchCurrentTournament()
    if (!tournament) {
      rootEl.innerHTML = ''
      return
    }
    entry = await fetchMyTournamentEntry(tournament.id)
    render()
  }

  function render () {
    if (!tournament) { rootEl.innerHTML = ''; return }
    const isLive = tournament.status === 'live'
    const isEntered = !!entry
    const targetDate = isLive ? tournament.end_at : tournament.start_at
    const labelTime = isLive
      ? (lang === 'fr' ? 'Fin dans' : 'Ends in')
      : (lang === 'fr' ? 'Démarre dans' : 'Starts in')

    rootEl.innerHTML = htmlRaw`
      <div class="tournament-banner">
        <div class="tournament-head">
          <div class="tournament-icon">${isLive ? '🏆' : '⏳'}</div>
          <div class="tournament-info">
            <div class="tournament-name">${escHTML(tournament.name)}</div>
            <div class="tournament-sub">${escHTML(tournament.description || '')}</div>
          </div>
        </div>

        <div class="tournament-stats">
          <div class="tournament-stat">
            <div class="tournament-stat-label">${lang === 'fr' ? 'Prize pool' : 'Prize pool'}</div>
            <div class="tournament-stat-value text-gold">${escHTML(formatEUR(tournament.prize_pool || 0))}</div>
          </div>
          <div class="tournament-stat">
            <div class="tournament-stat-label">${lang === 'fr' ? 'Entry fee' : 'Entry fee'}</div>
            <div class="tournament-stat-value">${escHTML(formatEUR(tournament.entry_fee || 0))}</div>
          </div>
          <div class="tournament-stat">
            <div class="tournament-stat-label">${escHTML(labelTime)}</div>
            <div class="tournament-stat-value text-up" id="tournament-cd">—</div>
          </div>
          ${isEntered ? htmlRaw`
            <div class="tournament-stat">
              <div class="tournament-stat-label">${lang === 'fr' ? 'Mon rang' : 'My rank'}</div>
              <div class="tournament-stat-value">#${escHTML(entry.rank || '?')}</div>
            </div>
          ` : ''}
        </div>

        ${isEntered ? htmlRaw`
          <div class="tournament-entered">
            ${lang === 'fr' ? '✓ Inscrit · PnL actuel' : '✓ Entered · Current PnL'} :
            <strong class="${(entry.current_pnl || 0) >= 0 ? 'text-up' : 'text-down'}">
              ${(entry.current_pnl || 0) >= 0 ? '+' : ''}${escHTML(formatEUR(entry.current_pnl || 0))}
            </strong>
          </div>
        ` : htmlRaw`
          <button id="tournament-enter" class="btn btn-gold btn-block">
            🎯 ${lang === 'fr' ? `Entrer (${formatEUR(tournament.entry_fee)})` : `Enter (${formatEUR(tournament.entry_fee)})`}
          </button>
        `}
      </div>
    `

    // Countdown
    const cdEl = rootEl.querySelector('#tournament-cd')
    if (cdEl) startCountdown(cdEl, targetDate, () => reload())

    // Bouton enter
    rootEl.querySelector('#tournament-enter')?.addEventListener('click', onEnter)
  }

  async function onEnter () {
    const btn = rootEl.querySelector('#tournament-enter')
    if (!btn) return
    btn.disabled = true
    hapticImpact()
    try {
      await enterTournament(tournament.id)
      hapticSuccess()
      toast.success(getLang() === 'fr' ? 'Inscrit au tournoi 🏆' : 'Entered tournament 🏆')
      await reload()
    } catch (e) {
      toast.error(e.message || 'Erreur', 5000)
      btn.disabled = false
    }
  }

  await reload()
  return reload  // permet de re-fetch en externe
}
