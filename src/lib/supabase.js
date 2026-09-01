import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ MISSING SUPABASE ENV VARIABLES IN VERCEL!");
}

console.log("🔑 Supabase URL:", supabaseUrl);
console.log("🔑 Supabase Key presente:", !!supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const TABLES = {
  USERS: 'fims_users',
  LOCATIONS: 'fims_locations',
  INSPECTIONS: 'fims_inspections',
  LOGS: 'fims_logs',
  NOTIFICATIONS: 'fims_notifications',
  TEMPLATES: 'fims_templates',
  TEMPLATE_CLIENTS: 'fims_template_clients'
};
