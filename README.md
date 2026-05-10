# PROPHET

> Prédictions in-app sur des marchés réels (politique, crypto, sport, IA…). €1000 virtuels offerts. Levier jusqu'à 10x. Classement mondial.

## ✅ Statut : Phases 1-7 livrées

| Phase | Contenu | Statut |
|---|---|---|
| **1. Fondations** | Schema · Auth anonyme · Dashboard · i18n FR/EN · PWA · Capacitor Android | ✅ |
| **2. Pricing engine** | Edge Function `fetch_prices` · vue `latest_prices` · cron 1min | ✅ |
| **3. Marchés directionnels** | open/lock/resolve SQL + cron · Trade modal · 6 timeframes | ✅ |
| **4. Trading + levier** | `place_bet` · liquidation 5min · funding fees 1h · positions view | ✅ |
| **5. Multi-actifs** | CoinGecko + Frankfurter live (no key) | ✅ |
| **6. Gamification** | Leaderboards 4 onglets · 9 achievements · onboarding tour | ✅ |
| **7. Live reality** | Import auto Polymarket · in-app betting · hard-refresh · CI/CD GitHub→Vercel | ✅ |

---

## 🌐 Audit "connecté à la réalité"

| Donnée | Source live | Clé requise | Auto-fetch |
|---|---|---|---|
| **Prix crypto** (BTC, ETH, SOL, +17) | [CoinGecko `simple/price`](https://api.coingecko.com) | ❌ | À chaque load + cache 30s |
| **Forex** (EUR/USD, GBP/USD, USD/JPY) | [Frankfurter `latest`](https://api.frankfurter.dev) (taux ECB officiels) | ❌ | À chaque load + cache 1h |
| **Crypto Fear & Greed** | [Alternative.me `fng`](https://api.alternative.me/fng) | ❌ | À chaque load |
| **Prédictions live** (politique, sport, IA, célébrités) | [Polymarket Gamma API](https://gamma-api.polymarket.com/markets) | ❌ | 100 markets · cache 1min mémoire + 24h disque |
| **Stocks** (AAPL, MSFT, +18) | Finnhub via Edge Function `fetch_prices` | ✅ secret côté serveur | Cron 1min |
| **Indices/commodities/VIX** | TwelveData via Edge Function | ✅ secret côté serveur | Cron 1min |
| **Resolution Polymarket** ⚠️ | Pas encore synchro back vers PROPHET | — | Manuel pour l'instant |

Toutes les autres données (balance, positions, leaderboard, achievements) sont **réelles côté Supabase** avec anti-cheat strict (RLS + RPC SECURITY DEFINER).

---

## 🎯 Comment ça marche pour le user

1. **Ouvre l'app** → onglet **Marchés**
2. **Voit en temps réel** : ~50 directional crypto + ~50 mock events seedés + jusqu'à 100 prédictions Polymarket importées (politique US, Iran, NBA, AI, célébrités…)
3. **Clique YES ou NO** sur n'importe quelle card → si c'est un market externe (Polymarket), import auto-magique dans la DB via RPC `import_external_market(jsonb)` → trade modal s'ouvre directement avec sliders mise/levier
4. **Place le pari** → le market et la position vivent désormais dans PROPHET (anti-cheat, leaderboard, etc.)
5. **Bouton hard-refresh** ↻ en haut à droite : vide tous les caches (service worker + localStorage + sessionStorage), garde la session auth + langue, reload propre

---

## 🛠 Stack

| Couche | Choix |
|---|---|
| **Frontend** | HTML5 + CSS vanilla + JavaScript ES6 modules (zéro framework) |
| **Backend** | Supabase Cloud (Postgres 15 + Auth anonyme + Edge Functions Deno + pg_cron + pg_net) |
| **Mobile** | Capacitor 6 (wrapper natif Android) |
| **Déploiement web** | Vercel (statique, no build) |
| **CI/CD** | GitHub Actions (deploy auto sur push main + previews sur PRs) |
| **APIs publiques** | CoinGecko · Frankfurter · Polymarket Gamma · Alternative.me |

---

## 🚀 Déploiement Vercel via GitHub (recommandé)

### 1. Pousse ton repo sur GitHub

```bash
cd /Users/dreano/Downloads/prophet
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:TON_USER/prophet.git
git push -u origin main
```

### 2. Connecte le repo à Vercel

- https://vercel.com/new → "Import Git Repository" → choisis le repo
- **Output Directory** : `www`
- **Build Command** : (laisse vide, no build needed)
- Deploy

À partir de là, **chaque push sur `main` déploie automatiquement** en prod, et les **PRs déclenchent un preview**.

### 3. (Alternative) Workflow GitHub Actions

Le repo contient déjà 2 workflows :
- [.github/workflows/deploy-vercel.yml](.github/workflows/deploy-vercel.yml) — deploy production sur push `main`
- [.github/workflows/preview-vercel.yml](.github/workflows/preview-vercel.yml) — preview sur PR + commentaire avec URL

**Secrets GitHub à configurer** (Settings → Secrets and variables → Actions) :
- `VERCEL_TOKEN` (générer sur vercel.com/account/tokens)
- `VERCEL_ORG_ID` (récupérer via `cat .vercel/project.json` après `vercel link` local)
- `VERCEL_PROJECT_ID` (idem)

### 4. CLI deploy ponctuel

```bash
npx vercel deploy --prod
```

---

## 📦 Installation locale

```bash
cd /Users/dreano/Downloads/prophet
npm install
```

### Backend Supabase

```bash
supabase login
supabase link --project-ref guevmgdxznrvxcjvvzyu
supabase db push                # applique les 11 migrations
```

Puis, dans le dashboard Supabase :
1. **Authentication** → Providers → **Anonymous Sign-Ins** → Enable
2. (Optionnel pour Edge Functions) **Settings** → Database → reset password si nécessaire
3. (Optionnel) **SQL Editor** :
   ```sql
   select vault.create_secret('https://guevmgdxznrvxcjvvzyu.supabase.co', 'project_url');
   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
   ```

### Frontend

```bash
npm run dev    # http://localhost:3000
```

### Android

```bash
npm run android:add      # 1ère fois
npm run android:sync     # après chaque modif frontend
npm run android:open     # ouvre Android Studio
```

---

## 🔄 Hard refresh button

Le bouton ↻ en haut à droite du header :
1. Préserve la session auth Supabase + la langue (`prophet.lang`)
2. Vide le localStorage des caches PROPHET (`prophet.polymarket_cache`, etc.)
3. Vide sessionStorage entièrement
4. Vide les caches du service worker (`caches.delete(...)`)
5. Désinscrit le service worker pour forcer un re-fetch propre
6. Reload avec un cache-buster `?_t=…`

Utile quand tu as déployé une nouvelle version et que le service worker sert encore l'ancien JS.

---

## 🔒 Sécurité (récap)

| Action | Côté client ? | Mécanisme |
|---|---|---|
| Lire profil / leaderboard public | ✅ | RLS public read |
| UPDATE `username`, `country_code`, `preferred_lang` | ✅ | column-level GRANT |
| UPDATE `balance`, `xp`, `level`, etc. | ❌ | `REVOKE UPDATE` + RPC SECURITY DEFINER |
| Insert positions / transactions | ❌ | RPC `place_bet` uniquement |
| Import market externe | ✅ (via RPC) | `import_external_market` valide la source |

---

## ❓ Troubleshooting

**"Could not find the function public.bootstrap_with_prices"** → migrations non poussées : `supabase db push`
**"Anonymous sign-ins are disabled"** → activer dans Dashboard → Auth → Providers
**App bloquée sur "Chargement…"** → clic sur ↻ hard refresh (ou DevTools : `localStorage.clear(); location.reload()`)
**Polymarket markets ne s'affichent pas** → vérifier dans DevTools Network qu'`gamma-api.polymarket.com` répond bien (CORS OK par défaut)

---

## 🗺️ Stack APIs (récap)

```
Frontend → CoinGecko        (crypto)        no key
Frontend → Frankfurter      (forex ECB)     no key
Frontend → Alternative.me   (F&G)           no key
Frontend → Polymarket Gamma (predictions)   no key
Frontend → Supabase Cloud   (auth, DB, RPC) publishable key (publique par design)
Edge Fn  → Finnhub          (stocks)        secret côté serveur
Edge Fn  → TwelveData       (indices/cmdty/forex/VIX) secret côté serveur
Edge Fn  → FRED             (macro Phase 8) secret côté serveur
```

---

## 📝 Licence

Capital virtuel uniquement · 100% gratuit · Aucun argent réel · Pas de jeu réglementé.
