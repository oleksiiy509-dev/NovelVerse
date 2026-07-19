import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://kpjqwfeveugjxfwuvwpe.supabase.co";
const supabaseKey = "sb_publishable_Nr6TiCkqZOrNL6MDOpGSNw_feMGUmqO";

export const supabase = createClient(supabaseUrl, supabaseKey);
