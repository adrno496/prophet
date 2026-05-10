// ============================================================================
// PROPHET — Countdown component
// Compte à rebours live (mise à jour chaque seconde) jusqu'à un timestamp.
// Auto-cleanup via MutationObserver quand l'élément est retiré du DOM.
// ============================================================================

const RAF_HANDLES = new Set()

function fmt (totalSeconds) {
  if (totalSeconds <= 0) return '0s'
  const d = Math.floor(totalSeconds / 86400)
  const h = Math.floor((totalSeconds % 86400) / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (d > 0) return `${d}j ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`
  return `${s}s`
}

// targetIso : timestamp ISO string ou Date
// onExpire : callback optionnel quand on atteint 0
export function startCountdown (el, targetIso, onExpire) {
  if (!el) return null
  const target = typeof targetIso === 'string' ? Date.parse(targetIso) : targetIso?.getTime?.() || targetIso
  if (!target || !isFinite(target)) {
    el.textContent = '—'
    return null
  }

  let intervalId

  function tick () {
    const now = Date.now()
    const remaining = Math.max(0, Math.floor((target - now) / 1000))
    el.textContent = fmt(remaining)

    // Pulse rouge dans les 30 dernières secondes (urgence)
    if (remaining > 0 && remaining <= 30) {
      el.classList.add('timer--critical')
    } else {
      el.classList.remove('timer--critical')
    }

    if (remaining <= 0) {
      stop()
      onExpire?.()
    }
    // Auto-stop si élément retiré du DOM
    if (!document.body.contains(el)) stop()
  }

  function stop () {
    if (intervalId) clearInterval(intervalId)
    intervalId = null
    RAF_HANDLES.delete(stop)
  }

  intervalId = setInterval(tick, 1000)
  RAF_HANDLES.add(stop)
  tick()
  return stop
}

export function stopAllCountdowns () {
  RAF_HANDLES.forEach(stop => stop())
  RAF_HANDLES.clear()
}
