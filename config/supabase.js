import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const missing = [
  ["SUPABASE_URL", supabaseUrl],
  ["SUPABASE_ANON_KEY", supabaseAnonKey],
  ["SUPABASE_SERVICE_ROLE_KEY", supabaseServiceKey],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  throw new Error(
    `Faltan variables de entorno de Supabase: ${missing.join(", ")}. Revisa BACK/.env (usa .env.example como plantilla).`,
  );
}

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

// Cliente público: solo para login/signup/validación de JWT.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, clientOptions);

// Cliente administrativo: acceso a tablas, Storage y Auth Admin.
// NUNCA debe exponerse al frontend.
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey,
  clientOptions,
);

export const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || "comprobantes";
