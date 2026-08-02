import { supabase } from "./supabase.js";

/** Delete complete novel aggregates in one database transaction. */
export async function deleteNovels(ids) {
  const novelIds = [...new Set(ids)].filter((id) => id !== null && id !== undefined);
  if (!novelIds.length) return 0;
  const { data, error } = await supabase.rpc("delete_novels", { novel_ids: novelIds });
  if (error) throw error;
  return data;
}
