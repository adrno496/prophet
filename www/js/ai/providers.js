// ============================================================================
// PULSE PREDICT — AI Providers registry
// 5 providers supportés : freemium (Groq via Cloudflare Worker), Anthropic,
// OpenAI, OpenRouter, Mistral. Tous parlent le format OpenAI chat/completions
// (sauf Anthropic qui a son propre format Messages — adapté côté provider).
// ============================================================================

import { getDeviceId } from './device.js'

// ⚠️ À remplacer par l'URL renvoyée par `wrangler deploy` (worker/README.md)
// Format : https://pulse-predict-proxy.<your-account>.workers.dev
export const FREEMIUM_PROXY_URL = 'https://pulse-predict-proxy.workers.dev'

export const PROVIDERS = {
  freemium: {
    id: 'freemium',
    name: 'PULSE AI (gratuit)',
    bundled: true,
    apiKeyLabel: null,
    endpoint: () => `${FREEMIUM_PROXY_URL}/v1/chat/completions`,
    models: [
      { id: 'llama-3.1-8b-instant',     name: 'Llama 3.1 8B (rapide)',  recommended: true },
      { id: 'llama-3.3-70b-versatile',  name: 'Llama 3.3 70B (qualité)' }
    ],
    defaultModel: 'llama-3.1-8b-instant',
    priceIn: 0, priceOut: 0,
    headers: () => ({
      'Content-Type': 'application/json',
      'X-Device-Id': getDeviceId()
    }),
    transformRequest: (p) => ({
      model: p.model,
      messages: p.messages,
      max_tokens: Math.min(p.max_tokens || 1000, 2000)
    }),
    transformResponse: (data) => data?.choices?.[0]?.message?.content || ''
  },

  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    bundled: false,
    apiKeyLabel: 'Anthropic API Key (sk-ant-…)',
    apiKeyPattern: /^sk-ant-/,
    endpoint: () => 'https://api.anthropic.com/v1/messages',
    models: [
      { id: 'claude-haiku-4-5',  name: 'Claude Haiku 4.5 (rapide)', recommended: true },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (équilibre)' },
      { id: 'claude-opus-4-7',   name: 'Claude Opus 4.7 (qualité max)' }
    ],
    defaultModel: 'claude-haiku-4-5',
    priceIn: 0.25, priceOut: 1.25,
    headers: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'Content-Type': 'application/json'
    }),
    transformRequest: (p) => {
      const sys = p.messages.find(m => m.role === 'system')?.content
      const userMsgs = p.messages.filter(m => m.role !== 'system')
      return {
        model: p.model,
        max_tokens: p.max_tokens || 1024,
        ...(sys ? { system: sys } : {}),
        messages: userMsgs
      }
    },
    transformResponse: (data) => data?.content?.[0]?.text || ''
  },

  openai: {
    id: 'openai',
    name: 'OpenAI',
    bundled: false,
    apiKeyLabel: 'OpenAI API Key (sk-…)',
    apiKeyPattern: /^sk-/,
    endpoint: () => 'https://api.openai.com/v1/chat/completions',
    models: [
      { id: 'gpt-4o-mini',   name: 'GPT-4o mini (rapide & cheap)', recommended: true },
      { id: 'gpt-4o',        name: 'GPT-4o (qualité)' }
    ],
    defaultModel: 'gpt-4o-mini',
    priceIn: 0.15, priceOut: 0.6,
    headers: (key) => ({
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    }),
    transformRequest: (p) => ({
      model: p.model,
      messages: p.messages,
      max_tokens: p.max_tokens || 1024
    }),
    transformResponse: (data) => data?.choices?.[0]?.message?.content || ''
  },

  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    bundled: false,
    apiKeyLabel: 'OpenRouter API Key (sk-or-…)',
    apiKeyPattern: /^sk-or-/,
    endpoint: () => 'https://openrouter.ai/api/v1/chat/completions',
    models: [
      { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (free)', recommended: true },
      { id: 'anthropic/claude-3.5-haiku',            name: 'Claude 3.5 Haiku' },
      { id: 'openai/gpt-4o-mini',                    name: 'GPT-4o mini' },
      { id: 'mistralai/mistral-small-latest',        name: 'Mistral Small' }
    ],
    defaultModel: 'meta-llama/llama-3.1-8b-instruct:free',
    priceIn: 0, priceOut: 0,
    headers: (key) => ({
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://pulse-predict.app',
      'X-Title': 'PULSE PREDICT'
    }),
    transformRequest: (p) => ({
      model: p.model,
      messages: p.messages,
      max_tokens: p.max_tokens || 1024
    }),
    transformResponse: (data) => data?.choices?.[0]?.message?.content || ''
  },

  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    bundled: false,
    apiKeyLabel: 'Mistral API Key',
    apiKeyPattern: /.+/,
    endpoint: () => 'https://api.mistral.ai/v1/chat/completions',
    models: [
      { id: 'mistral-small-latest', name: 'Mistral Small', recommended: true },
      { id: 'mistral-large-latest', name: 'Mistral Large (qualité)' }
    ],
    defaultModel: 'mistral-small-latest',
    priceIn: 0.2, priceOut: 0.6,
    headers: (key) => ({
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    }),
    transformRequest: (p) => ({
      model: p.model,
      messages: p.messages,
      max_tokens: p.max_tokens || 1024
    }),
    transformResponse: (data) => data?.choices?.[0]?.message?.content || ''
  }
}

export function getProvider (id) {
  return PROVIDERS[id] || PROVIDERS.freemium
}
