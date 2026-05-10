// ============================================================================
// PROPHET — Profile view
// Pseudo · langue · reset compte · déconnexion
// (Phase 1 minimal, étoffé Phase 6 avec achievements/badges)
// ============================================================================

import { store, loadProfile, resetAccount, updateUsername } from '../state.js'
import { signOut } from '../auth.js'
import { t, getLang, setLang } from '../i18n/index.js'
import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { formatEUR, formatWinrate } from '../utils/format.js'
import { toast } from '../components/toast.js'
import { fetchOwnAchievements, ACHIEVEMENTS_META } from '../api/achievements.js'

export function mountProfile (rootEl) {
  let achievements = []

  function render () {
    const profile = store.profile
    const lang = getLang()

    if (!profile) {
      rootEl.innerHTML = htmlRaw`<div class="container"><p class="text-mute" style="text-align:center;padding:var(--sp-8) 0">${escHTML(t('loading'))}</p></div>`
      return
    }

    const unlockedCodes = new Set(achievements.map(a => a.code))
    const totalBadges = Object.keys(ACHIEVEMENTS_META).length

    rootEl.innerHTML = htmlRaw`
      <div class="container stack-6">

        <div class="card-elevated card">
          <div class="row-between">
            <div class="stack-2">
              <div class="text-mute" style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:0.06em">${escHTML(t('profile.username'))}</div>
              <div style="font-size:var(--fs-xl);font-weight:800">${escHTML(profile.username)}</div>
            </div>
            <span class="level-chip">${escHTML(t('header.level', { n: profile.level }))}</span>
          </div>
          <div class="spacer-2"></div>
          <button id="btn-edit-username" class="btn btn-link">✏️ ${lang === 'fr' ? 'Changer pseudo' : 'Edit username'}</button>
        </div>

        <div class="grid-2">
          <div class="stat">
            <div class="stat-label">${escHTML(t('dashboard.balance_label'))}</div>
            <div class="stat-value">${escHTML(formatEUR(profile.balance))}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${escHTML(t('dashboard.stats_peak'))}</div>
            <div class="stat-value text-gold">${escHTML(formatEUR(profile.peak_balance))}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${escHTML(t('dashboard.stats_trades'))}</div>
            <div class="stat-value">${escHTML(profile.total_trades || 0)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${escHTML(t('dashboard.stats_winrate'))}</div>
            <div class="stat-value">${escHTML(formatWinrate(profile.wins, profile.losses))}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">
            🏅 ${lang === 'fr' ? 'Badges' : 'Achievements'} (${unlockedCodes.size}/${totalBadges})
          </div>
          <div class="grid-3" style="gap:var(--sp-2)">
            ${Object.entries(ACHIEVEMENTS_META).map(([code, meta]) => {
              const unlocked = unlockedCodes.has(code)
              return htmlRaw`
                <div class="card" style="padding:var(--sp-3);text-align:center;${unlocked ? '' : 'opacity:0.35;filter:grayscale(1)'}" title="${escHTML(unlocked ? meta['desc_' + lang] : '???')}">
                  <div style="font-size:28px">${meta.icon}</div>
                  <div style="font-size:var(--fs-xs);margin-top:var(--sp-1);font-weight:700">${escHTML(meta['label_' + lang])}</div>
                </div>
              `
            }).join('')}
          </div>
        </div>

        <div class="card stack-3">
          <div style="font-weight:700">${escHTML(t('profile.lang_section'))}</div>
          <div class="lang-toggle" style="align-self:flex-start">
            <button data-lang="fr" class="${lang === 'fr' ? 'active' : ''}">FR</button>
            <button data-lang="en" class="${lang === 'en' ? 'active' : ''}">EN</button>
          </div>
        </div>

        <div class="stack-3">
          <button id="btn-reset" class="btn btn-ghost btn-block">
            ${escHTML(t('profile.reset_btn'))}
          </button>
          <button id="btn-signout" class="btn btn-ghost btn-block" style="border-color:var(--red);color:var(--red)">
            ${escHTML(t('profile.signout_btn'))}
          </button>
        </div>

      </div>
    `

    rootEl.querySelectorAll('[data-lang]').forEach(b => {
      b.addEventListener('click', () => setLang(b.getAttribute('data-lang')))
    })
    rootEl.querySelector('#btn-reset').addEventListener('click', onReset)
    rootEl.querySelector('#btn-signout').addEventListener('click', onSignOut)
    rootEl.querySelector('#btn-edit-username').addEventListener('click', onEditUsername)
  }

  async function onEditUsername () {
    const lang = getLang()
    const current = store.profile?.username || ''
    const next = window.prompt(lang === 'fr' ? 'Nouveau pseudo (3-12 car., lettres/chiffres/_)' : 'New username (3-12 chars, letters/digits/_)', current)
    if (!next || next === current) return
    try {
      await updateUsername(next.trim())
      toast.success(t('toast.saved'))
    } catch (e) {
      toast.error(e.message || t('toast.error_generic'))
    }
  }

  async function onReset () {
    if (!window.confirm(t('profile.reset_confirm'))) return
    try {
      await resetAccount()
      toast.success(t('profile.reset_success'))
    } catch (e) {
      const msg = e.message || ''
      if (msg.toLowerCase().includes('cooldown')) {
        toast.error(t('profile.reset_cooldown'))
      } else if (msg.toLowerCase().includes('balance')) {
        toast.error(t('profile.reset_too_high'))
      } else {
        toast.error(msg || t('toast.error_generic'))
      }
    }
  }

  async function onSignOut () {
    try {
      await signOut()
      window.location.replace('index.html')
    } catch (e) {
      toast.error(e.message || t('toast.error_generic'))
    }
  }

  async function loadAchievements () {
    achievements = await fetchOwnAchievements()
    render()
  }

  render()
  store.on('profile', render)
  window.addEventListener('lang-changed', render)
  loadProfile()
  loadAchievements()
}
