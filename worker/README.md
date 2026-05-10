# PULSE PREDICT — Cloudflare Worker (freemium AI proxy)

Proxy minimal vers **Groq** avec rate-limit par device dans **Cloudflare KV**.
Permet aux utilisateurs de PULSE PREDICT d'utiliser l'IA **sans clé API** :
30 messages/jour offerts, modèles Llama 3.1 8B + Llama 3.3 70B en whitelist.

## Architecture

```
┌──────────────┐  POST /v1/chat/completions          ┌──────────────────┐
│ App PULSE    │──────────────────────────────────►  │ Cloudflare       │
│ (browser     │  Headers: X-Device-Id (UUID v4)     │ Worker           │
│  Capacitor)  │                                      │ + KV (rate limit)│
└──────────────┘                                      └─────────┬────────┘
                                                                │
                                                                ▼ Bearer ENV.GROQ_API_KEY
                                                      ┌─────────────────┐
                                                      │ api.groq.com    │
                                                      │ /v1/chat/...    │
                                                      └─────────────────┘
```

**Flow** :
1. App envoie un POST avec un `X-Device-Id` (UUID stocké en localStorage côté user)
2. Worker valide : header pattern, body size, modèle whitelistée
3. Worker check + incrémente le compteur `q:{deviceId}:{YYYY-MM-DD}` dans KV (TTL 26h)
4. Si quota atteint → `429 quota_exceeded` (avec `reset` ISO date)
5. Sinon → proxie vers Groq avec MA clé serveur, renvoie la réponse OpenAI-compatible

## Déploiement (5 commandes)

```bash
cd worker
npm install
npx wrangler login
npx wrangler kv namespace create QUOTA
# → COPIE l'id retourné, COLLE-le dans wrangler.toml à la place de REPLACE_WITH_KV_ID
npx wrangler secret put GROQ_API_KEY
# → COLLE ta clé Groq (gratuite : https://console.groq.com/keys)
npx wrangler deploy
# → COPIE l'URL renvoyée (ex: https://pulse-predict-proxy.<ton-account>.workers.dev)
```

Puis dans `www/js/ai/providers.js`, remplace la constante `FREEMIUM_PROXY_URL` par cette URL.

## Endpoints

### `POST /v1/chat/completions`

**Headers** :
```
X-Device-Id: <UUID v4 alphanumérique 8-64 chars>
Content-Type: application/json
```

**Body** (format OpenAI) :
```json
{
  "model": "llama-3.1-8b-instant",
  "messages": [
    {"role": "system", "content": "You are a market analyst."},
    {"role": "user", "content": "Predict BTC for next 24h."}
  ],
  "max_tokens": 500
}
```

**Réponses** :

| Status | Cas | Body |
|---|---|---|
| `200` | OK | Réponse Groq (`choices[0].message.content`) |
| `400` | `bad_device_id`, `bad_json`, `model_not_allowed`, `missing_messages` | `{error: {code, ...}}` |
| `413` | Body > 64 KiB | `{error: {code: "body_too_large"}}` |
| `429` | Quota épuisé | `{error: {code: "quota_exceeded", quota, used, reset}}` |
| `502` | Groq down | `{error: {code: "upstream_unreachable"}}` |

Headers retournés :
- `X-Quota-Limit` : quota quotidien (ex: `30`)
- `X-Quota-Remaining` : restant après cet appel
- `X-Quota-Reset` : ISO date du prochain reset (minuit UTC)

### `GET /health`

Healthcheck simple : retourne `{ ok: true, time: ... }`.

## Configuration

Modèles autorisés (whitelist en dur dans `src/index.js`) :
- `llama-3.1-8b-instant` — rapide & ultra-léger
- `llama-3.3-70b-versatile` — qualité supérieure

Pour ajouter un modèle : éditer `WHITELIST_MODELS` puis `wrangler deploy`.

Quota par jour : variable d'env `DAILY_QUOTA` dans `wrangler.toml` (par défaut 30).

## Tests local

```bash
npx wrangler dev
# → écoute sur http://localhost:8787
```

```bash
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: test-device-12345" \
  -d '{"model":"llama-3.1-8b-instant","messages":[{"role":"user","content":"Say PONG."}]}'
```

## Logs en production

```bash
npx wrangler tail
```

## Sécurité

- ✅ La clé Groq vit **uniquement** comme secret Cloudflare (jamais dans le code app)
- ✅ Whitelist de modèles serveur-side (un attaquant ne peut pas forcer un Mixtral cher)
- ✅ Rate limit par device (30/jour) → coût borné
- ✅ Body size 64 KiB max
- ✅ CORS `*` (compat Capacitor `capacitor://localhost`, `null`, etc.)
- ⚠️ Le `X-Device-Id` peut être randomisé par un attaquant déterminé (autant de quotas que d'IDs). Mitigations possibles si abus :
  - Captcha à la 1ère utilisation
  - Bloc par IP (Cloudflare Rate Limiting Rules)
  - Réduire `DAILY_QUOTA`
