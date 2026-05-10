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
import { PROVIDERS, getProvider } from '../ai/providers.js'
import { loadAISettings, saveAISettings, validateApiKey } from '../ai/settings.js'
import { pingAI, QuotaExceededError } from '../ai/client.js'
import { fetchMyBalanceHistory, fetchAIAccuracyByDay } from '../api/profile-charts.js'
import { renderPnLChart, renderAccuracyChart } from '../components/chart.js'

// Génère une couleur déterministe à partir du pseudo (palette PULSE)
function avatarColor (username) {
  const palette = [
    'linear-gradient(135deg,#63CAFF,#3B8BCC)',
    'linear-gradient(135deg,#00E472,#00B359)',
    'linear-gradient(135deg,#FFB547,#CC8B33)',
    'linear-gradient(135deg,#A78BFA,#7C3AED)',
    'linear-gradient(135deg,#FF3B5C,#CC2244)',
    'linear-gradient(135deg,#14B8A6,#0F9080)',
    'linear-gradient(135deg,#F472B6,#BE185D)'
  ]
  let hash = 0
  for (const c of (username || 'user')) hash = (hash * 31 + c.charCodeAt(0)) | 0
  return palette[Math.abs(hash) % palette.length]
}

function avatarInitial (username) {
  const s = (username || '?').replace(/^user_/, '').trim()
  return (s[0] || '?').toUpperCase()
}

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
          <div class="row" style="gap:var(--sp-3);align-items:center">
            <div class="profile-avatar" style="background:${avatarColor(profile.username)}">
              ${escHTML(avatarInitial(profile.username))}
            </div>
            <div class="stack" style="gap:2px;flex:1;min-width:0">
              <div class="text-mute" style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:0.06em">${escHTML(t('profile.username'))}</div>
              <div style="font-size:var(--fs-xl);font-weight:800;letter-spacing:-0.01em" class="truncate">${escHTML(profile.username)}</div>
              <div class="row" style="gap:var(--sp-2);margin-top:2px">
                <span class="level-chip">${escHTML(t('header.level', { n: profile.level }))}</span>
                <span class="badge badge-up">${escHTML(profile.total_trades || 0)} trades</span>
              </div>
            </div>
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

        <div class="card">
          <div class="section-title" style="margin-bottom:var(--sp-3)">
            📈 ${lang === 'fr' ? 'Progression du solde' : 'Balance progression'}
          </div>
          <div style="height:180px">
            <canvas id="pnl-chart"></canvas>
          </div>
        </div>

        <div class="card">
          <div class="section-title" style="margin-bottom:var(--sp-3)">
            🤖 ${lang === 'fr' ? 'Track record IA (14 j)' : 'AI track record (14d)'}
          </div>
          <div style="height:160px">
            <canvas id="ai-accuracy-chart"></canvas>
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

        <div class="card stack-3" id="ai-settings-card">
          <div style="font-weight:700">🤖 ${lang === 'fr' ? 'Assistant IA' : 'AI Assistant'}</div>
          ${renderAISection(lang)}
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

    // AI section
    bindAISection()
  }

  function renderAISection (lang) {
    const s = loadAISettings()
    const p = s.providerObj
    const optionsHtml = Object.values(PROVIDERS).map(prov => {
      const sel = prov.id === s.provider ? 'selected' : ''
      const tag = prov.bundled ? ' ✨ Gratuit' : ''
      return `<option value="${escHTML(prov.id)}" ${sel}>${escHTML(prov.name + tag)}</option>`
    }).join('')

    const modelOptions = (p.models || []).map(m => {
      const id = typeof m === 'string' ? m : m.id
      const name = typeof m === 'string' ? m : m.name
      const sel = id === (s.model || p.defaultModel) ? 'selected' : ''
      return `<option value="${escHTML(id)}" ${sel}>${escHTML(name)}</option>`
    }).join('')

    return `
      <select id="ai-provider" class="card" style="border:1px solid var(--border-strong);padding:var(--sp-2) var(--sp-3);background:var(--bg-elevated);font-size:var(--fs-sm)">
        ${optionsHtml}
      </select>

      <select id="ai-model" class="card" style="border:1px solid var(--border-strong);padding:var(--sp-2) var(--sp-3);background:var(--bg-elevated);font-size:var(--fs-sm)">
        ${modelOptions}
      </select>

      ${p.bundled ? `
        <div style="background:rgba(0,228,114,0.08);border:1px solid rgba(0,228,114,0.3);border-radius:var(--radius);padding:var(--sp-3);font-size:var(--fs-sm)">
          ✓ ${lang === 'fr' ? 'Aucune configuration nécessaire — 30 messages/jour offerts' : 'No setup needed — 30 free messages/day'}
        </div>
      ` : `
        <input
          type="password"
          id="ai-key"
          class="card"
          autocomplete="off"
          placeholder="${escHTML(p.apiKeyLabel || 'API Key')}"
          value="${escHTML(s.apiKey || '')}"
          style="border:1px solid var(--border-strong);padding:var(--sp-2) var(--sp-3);background:var(--bg-elevated);font-size:var(--fs-sm)"
        />
        <div class="text-mute" style="font-size:var(--fs-xs)">
          ${lang === 'fr' ? '🔒 Stocké en localStorage uniquement, jamais envoyé sur PROPHET.' : '🔒 Stored in localStorage only, never sent to PULSE servers.'}
        </div>
      `}

      <div class="row" style="gap:var(--sp-2)">
        <button id="btn-ai-save" class="btn btn-primary" style="flex:1">
          ${lang === 'fr' ? 'Enregistrer' : 'Save'}
        </button>
        <button id="btn-ai-test" class="btn btn-ghost" style="flex:1">
          ${lang === 'fr' ? '🔌 Tester' : '🔌 Test'}
        </button>
      </div>
      <div id="ai-status" class="text-mute" style="font-size:var(--fs-xs);min-height:18px"></div>
    `
  }

  function bindAISection () {
    const providerSel = rootEl.querySelector('#ai-provider')
    const modelSel = rootEl.querySelector('#ai-model')
    const keyInput = rootEl.querySelector('#ai-key')
    const saveBtn = rootEl.querySelector('#btn-ai-save')
    const testBtn = rootEl.querySelector('#btn-ai-test')
    const statusEl = rootEl.querySelector('#ai-status')

    if (!providerSel || !saveBtn) return

    providerSel.addEventListener('change', () => {
      // Switch provider → re-render la section pour adapter clé/modèles
      const newProvider = providerSel.value
      saveAISettings({ provider: newProvider, model: '' })
      const card = rootEl.querySelector('#ai-settings-card')
      if (card) {
        const lang = getLang()
        card.innerHTML = `<div style="font-weight:700">🤖 ${lang === 'fr' ? 'Assistant IA' : 'AI Assistant'}</div>` + renderAISection(lang)
        bindAISection()
      }
    })

    saveBtn.addEventListener('click', () => {
      const provider = providerSel.value
      const model = modelSel ? modelSel.value : ''
      const apiKey = keyInput ? keyInput.value.trim() : ''
      const validation = validateApiKey(provider, apiKey)
      if (!validation.ok) {
        statusEl.textContent = getLang() === 'fr'
          ? '❌ Clé API invalide (' + validation.reason + ')'
          : '❌ Invalid API key (' + validation.reason + ')'
        statusEl.style.color = 'var(--red)'
        return
      }
      saveAISettings({ provider, apiKey, model })
      statusEl.textContent = getLang() === 'fr' ? '✓ Enregistré' : '✓ Saved'
      statusEl.style.color = 'var(--neon)'
      toast.success(t('toast.saved'))
    })

    testBtn.addEventListener('click', async () => {
      statusEl.textContent = getLang() === 'fr' ? '⏳ Ping IA en cours…' : '⏳ Pinging AI…'
      statusEl.style.color = 'var(--text-muted)'
      testBtn.disabled = true
      try {
        const reply = await pingAI()
        statusEl.textContent = '✓ ' + reply.slice(0, 80)
        statusEl.style.color = 'var(--neon)'
        toast.success(getLang() === 'fr' ? 'IA opérationnelle' : 'AI working')
      } catch (e) {
        let msg = e.message || 'erreur inconnue'
        if (e instanceof QuotaExceededError) {
          msg = getLang() === 'fr'
            ? `Quota épuisé (${e.used}/${e.quota}). Réessaie demain ou ajoute ta clé.`
            : `Quota exhausted (${e.used}/${e.quota}). Try tomorrow or add your key.`
        }
        statusEl.textContent = '❌ ' + msg
        statusEl.style.color = 'var(--red)'
        toast.error(msg, 6000)
      } finally {
        testBtn.disabled = false
      }
    })
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
    // Render des charts après le DOM update
    setTimeout(loadCharts, 50)
  }

  let pnlChartInst = null
  let aiChartInst = null

  async function loadCharts () {
    try {
      const pnlEl = rootEl.querySelector('#pnl-chart')
      if (pnlEl) {
        const history = await fetchMyBalanceHistory(30)
        if (history.length >= 2) {
          if (pnlChartInst) pnlChartInst.destroy()
          pnlChartInst = await renderPnLChart(pnlEl, history)
        } else {
          // Pas assez de données → message
          pnlEl.parentElement.innerHTML = `<div class="text-mute" style="text-align:center;padding:var(--sp-4) 0;font-size:var(--fs-sm)">${getLang() === 'fr' ? 'Pas encore d\'historique. Place quelques paris !' : 'No history yet. Place some bets!'}</div>`
        }
      }

      const aiEl = rootEl.querySelector('#ai-accuracy-chart')
      if (aiEl) {
        const accuracy = await fetchAIAccuracyByDay(14)
        if (accuracy.length > 0) {
          if (aiChartInst) aiChartInst.destroy()
          aiChartInst = await renderAccuracyChart(aiEl, accuracy)
        } else {
          aiEl.parentElement.innerHTML = `<div class="text-mute" style="text-align:center;padding:var(--sp-4) 0;font-size:var(--fs-sm)">${getLang() === 'fr' ? 'Aucune prédiction IA résolue.' : 'No resolved AI predictions yet.'}</div>`
        }
      }
    } catch (e) {
      console.warn('[profile] charts error', e)
    }
  }

  render()
  const unsubProfile = store.on('profile', render)
  window.addEventListener('lang-changed', render)
  loadProfile()
  loadAchievements()

  return () => {
    if (typeof unsubProfile === 'function') unsubProfile()
    window.removeEventListener('lang-changed', render)
    if (pnlChartInst) { try { pnlChartInst.destroy() } catch {} }
    if (aiChartInst) { try { aiChartInst.destroy() } catch {} }
  }
}
