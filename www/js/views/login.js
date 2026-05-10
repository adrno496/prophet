// ============================================================================
// PROPHET — Login view (index.html)
// Hero "PROPHET" + input pseudo (optionnel) + bouton ENTRER + toggle FR/EN
// Auth anonyme : 1 clic = compte créé avec €1000
// ============================================================================

import { signInAnonymous, validateUsername, getSession } from '../auth.js'
import { t, getLang, setLang } from '../i18n/index.js'
import { escHTML, htmlRaw } from '../utils/escHTML.js'
import { toast } from '../components/toast.js'

export async function mountLogin (rootEl) {
  // Si déjà connecté, redirige vers app.html
  const session = await getSession()
  if (session) {
    window.location.replace('app.html')
    return
  }

  function render () {
    const lang = getLang()
    rootEl.innerHTML = htmlRaw`
      <div class="login-shell">
        <div></div>

        <div class="login-hero">
          <div>
            <div class="hero-title">${escHTML(t('app.name'))}</div>
            <div class="spacer-2"></div>
            <div class="hero-tagline">${escHTML(t('app.tagline'))}</div>
          </div>

          <ul class="hero-bullets">
            <li>${escHTML(t('login.bullet_capital'))}</li>
            <li>${escHTML(t('login.bullet_markets'))}</li>
            <li>${escHTML(t('login.bullet_leverage'))}</li>
          </ul>

          <div class="stack-3" style="width:100%;max-width:360px">
            <input
              id="login-username"
              type="text"
              class="card"
              maxlength="12"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              placeholder="${lang === 'fr' ? 'Pseudo (optionnel, 3-12 car.)' : 'Username (optional, 3-12 chars)'}"
              style="border:1px solid var(--border-strong);border-radius:var(--radius);padding:var(--sp-3) var(--sp-4);font-size:var(--fs-base);text-align:center;background:var(--card)"
            />
            <button id="login-cta" class="btn btn-primary btn-lg btn-block">
              ${lang === 'fr' ? 'ENTRER DANS L\'ARÈNE →' : 'ENTER THE ARENA →'}
            </button>
          </div>

          <div class="text-mute" style="font-size:var(--fs-xs);max-width:360px;line-height:1.6">
            ${escHTML(t('login.legal'))}
          </div>
        </div>

        <div style="display:flex;justify-content:center">
          <div class="lang-toggle" id="lang-toggle">
            <button data-lang="fr" class="${lang === 'fr' ? 'active' : ''}">FR</button>
            <button data-lang="en" class="${lang === 'en' ? 'active' : ''}">EN</button>
          </div>
        </div>
      </div>
    `

    // Toggle langue
    rootEl.querySelectorAll('[data-lang]').forEach(b => {
      b.addEventListener('click', () => setLang(b.getAttribute('data-lang')))
    })

    // CTA
    const cta = rootEl.querySelector('#login-cta')
    const input = rootEl.querySelector('#login-username')
    cta.addEventListener('click', onSubmit)
    input.addEventListener('keydown', e => { if (e.key === 'Enter') onSubmit() })
  }

  async function onSubmit () {
    const cta = rootEl.querySelector('#login-cta')
    const input = rootEl.querySelector('#login-username')
    const raw = input.value.trim()

    const v = validateUsername(raw || null)
    if (!v.ok) {
      const lang = getLang()
      toast.error(lang === 'fr'
        ? 'Pseudo invalide (3-12 caractères, lettres/chiffres/_)'
        : 'Invalid username (3-12 chars, letters/digits/_)')
      input.focus()
      return
    }

    cta.disabled = true
    cta.textContent = t('loading')

    try {
      const result = await signInAnonymous(v.value)
      if (v.value && result.usernameApplied === false) {
        // Username pris → on continue quand même mais on signale
        toast.info(getLang() === 'fr'
          ? `Pseudo déjà pris. Tu peux le changer dans ton profil.`
          : `Username taken. You can change it in your profile.`)
      }
      // Redirection
      window.location.replace('app.html')
    } catch (e) {
      console.error(e)
      cta.disabled = false
      cta.textContent = getLang() === 'fr' ? 'ENTRER DANS L\'ARÈNE →' : 'ENTER THE ARENA →'
      toast.error(t('toast.error_generic') + ' · ' + (e.message || ''))
    }
  }

  render()
  window.addEventListener('lang-changed', render)
}
