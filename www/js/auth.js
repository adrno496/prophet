// ============================================================================
// PROPHET — auth.js
// Auth anonyme : 1 clic + pseudo optionnel (signInAnonymously + update_username)
// Aucun email, aucun mot de passe — friction minimale.
// ============================================================================

import { sb } from './supabase-client.js'

// Régex partagée avec la contrainte SQL (3-12 alphanum + underscore)
const USERNAME_RE = /^[a-zA-Z0-9_]{3,12}$/

export function validateUsername (input) {
  if (!input) return { ok: true, value: null } // pseudo optionnel
  const trimmed = String(input).trim()
  if (!USERNAME_RE.test(trimmed)) {
    return { ok: false, error: 'username_invalid' }
  }
  return { ok: true, value: trimmed }
}

// Sign in anonymous + (optional) custom username via RPC
export async function signInAnonymous (desiredUsername) {
  // 1. Créer le user anonyme dans auth.users → trigger handle_new_user crée le profil
  const { data, error } = await sb.auth.signInAnonymously()
  if (error) throw error
  if (!data?.user) throw new Error('No user returned from signInAnonymously')

  // 2. Si pseudo fourni, l'appliquer via la RPC sécurisée
  if (desiredUsername) {
    try {
      const { error: rpcErr } = await sb.rpc('update_username', { p_username: desiredUsername })
      if (rpcErr) {
        // Ne pas bloquer le login si username déjà pris : garde l'auto-généré
        console.warn('update_username failed:', rpcErr.message)
        return { user: data.user, usernameApplied: false, reason: rpcErr.message }
      }
    } catch (e) {
      console.warn('update_username error:', e)
      return { user: data.user, usernameApplied: false, reason: e.message }
    }
  }

  return { user: data.user, usernameApplied: !!desiredUsername }
}

export async function signOut () {
  const { error } = await sb.auth.signOut()
  if (error) throw error
}

export async function getSession () {
  const { data } = await sb.auth.getSession()
  return data?.session || null
}

export async function getUser () {
  const { data } = await sb.auth.getUser()
  return data?.user || null
}

export function onAuthChange (cb) {
  return sb.auth.onAuthStateChange((event, session) => cb({ event, session }))
}

// À appeler au boot d'app.html : redirige vers index.html si pas de session
export async function requireAuth () {
  const session = await getSession()
  if (!session) {
    window.location.replace('index.html')
    return null
  }
  return session
}
