export const CHAPTER_LIST_COLUMNS = "id,novel_id,number,title";
const CHAPTER_PAGE_SIZE = 500;

export async function fetchChapterMetadataPages(supabase, configure = (query) => query) {
  const chapters = [];
  for (let from = 0; ; from += CHAPTER_PAGE_SIZE) {
    const query = configure(supabase.from("chapters").select(CHAPTER_LIST_COLUMNS).order("novel_id").order("number"))
      .range(from, from + CHAPTER_PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw error;
    const page = data || [];
    chapters.push(...page);
    if (page.length < CHAPTER_PAGE_SIZE) break;
  }
  return chapters;
}

export async function fetchChapterContent(supabase, chapterId) {
  const { data, error } = await supabase.from("chapters").select("id,novel_id,number,title,content").eq("id", chapterId).single();
  if (error) throw error;
  return data;
}
