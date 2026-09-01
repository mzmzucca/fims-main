import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ MISSING SUPABASE ENV VARIABLES IN VERCEL!");
}

console.log("🔑 Supabase URL:", supabaseUrl);
console.log("🔑 Supabase Key presente:", !!supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
