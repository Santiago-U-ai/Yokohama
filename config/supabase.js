import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "SUPABASE_URL y SUPABASE_ANON_KEY deben estar configuradas en .env",
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
