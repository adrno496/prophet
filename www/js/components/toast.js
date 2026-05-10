// ============================================================================
// PROPHET — toast component
// Notifications top-right (success/error/info) avec auto-dismiss
// ============================================================================

import { escHTML } from '../utils/escHTML.js'

let stack = null

function ensureStack () {
  if (stack && document.body.contains(stack)) return stack
  stack = document.createElement('div')
  stack.className = 'toast-stack'
  document.body.appendChild(stack)
  return stack
}

export function showToast (message, type = 'info', durationMs = 3200) {
  const node = ensureStack()
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.innerHTML = escHTML(message)
  node.appendChild(toast)

  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(-8px)'
    toast.style.transition = 'opacity 200ms, transform 200ms'
    setTimeout(() => toast.remove(), 220)
  }, durationMs)
}

export const toast = {
  success: (msg, d) => showToast(msg, 'success', d),
  error:   (msg, d) => showToast(msg, 'error', d),
  info:    (msg, d) => showToast(msg, 'info', d)
}
