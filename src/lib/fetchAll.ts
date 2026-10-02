// PostgREST returns at most 1000 rows per request (Supabase "max rows"). Set logs pass
// that quickly — especially after a Hevy/Strong import — and an ascending query then
// silently drops the NEWEST sets. fetchAll pages through with .range() until done.
// The query must have a stable order (add a unique tiebreaker such as .order('id')).

const PAGE = 1000;

export async function fetchAll<T = any>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return { data: out, error: null };
  }
}
