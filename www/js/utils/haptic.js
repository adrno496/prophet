// ============================================================================
// PULSE PREDICT — haptic
// Feedback tactile via Vibration API (Android Chrome / Capacitor WebView).
// Fallback silencieux sur iOS / desktop.
// ============================================================================

function vibrate (pattern) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern)
    }
  } catch (_) { /* silent */ }
}

// Tap léger : confirmation d'action (clic sur bouton)
export function hapticTap () { vibrate(20) }

// Impact moyen : pari placé
export function hapticImpact () { vibrate(50) }

// Succès : 2 vibrations courtes
export function hapticSuccess () { vibrate([40, 60, 80]) }

// Erreur / liquidation : 1 longue
export function hapticError () { vibrate(200) }

// Win : pattern festif
export function hapticWin () { vibrate([50, 50, 100, 50, 200]) }
