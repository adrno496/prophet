// ============================================================================
// PROPHET — Supabase client
// Singleton, import via CDN ESM (vanilla, pas de bundler)
// La publishable key est PUBLIQUE par design (sécurité = RLS + RPC SECURITY DEFINER)
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = 'https://guevmgdxznrvxcjvvzyu.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ZoulExB_bKV1a4m_G9ThNw_2tHVT9zC'

export const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: window.localStorage
  }
})

export const PROJECT_REF = 'guevmgdxznrvxcjvvzyu'
