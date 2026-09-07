import { useState, useEffect, useCallback } from 'react';

export function useAsyncData<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    fn()
      .then((result) => { if (!cancelled) { setData(result); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'Fehler'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => run(), [run]);

  return { data, loading, error };
}
