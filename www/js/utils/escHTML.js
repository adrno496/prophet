// ============================================================================
// PROPHET — escHTML
// Anti-XSS : échappement systématique avant injection via innerHTML
// ============================================================================

const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;'
}

export function escHTML (input) {
  if (input == null) return ''
  return String(input).replace(/[&<>"'/`]/g, ch => ENTITIES[ch])
}

// Tagged template helper : html`<p>${userInput}</p>` échappe automatiquement
export function html (strings, ...values) {
  let out = ''
  strings.forEach((s, i) => {
    out += s
    if (i < values.length) {
      const v = values[i]
      if (Array.isArray(v)) out += v.join('')
      else out += escHTML(v)
    }
  })
  return out
}

// Variante "safe" : interpole sans échapper (à utiliser avec PRUDENCE pour
// ré-injecter du HTML déjà échappé / construit)
export function htmlRaw (strings, ...values) {
  let out = ''
  strings.forEach((s, i) => {
    out += s
    if (i < values.length) {
      const v = values[i]
      if (Array.isArray(v)) out += v.join('')
      else if (v != null) out += String(v)
    }
  })
  return out
}
