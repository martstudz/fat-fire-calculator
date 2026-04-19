import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

// If env vars aren't present (e.g. running as a standalone artifact),
// export a no-op stub so the app loads without crashing.
const noop = () => Promise.resolve({ data: null, error: new Error("Supabase not configured") });
const noopChain = () => ({ select: noopChain, eq: noopChain, single: noop, insert: noop, update: noopChain, upsert: noop, delete: noopChain });

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithOAuth: noop,
        signOut: noop,
        getUser: () => Promise.resolve({ data: { user: null } }),
      },
      from: () => noopChain(),
    };
