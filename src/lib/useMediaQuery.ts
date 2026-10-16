import { useEffect, useState } from 'react';

const query = (q: string) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q) : null);

export function useMediaQuery(q: string): boolean {
  const [matches, setMatches] = useState(() => query(q)?.matches ?? false);
  useEffect(() => {
    const mql = query(q);
    if (!mql) return;
    const on = () => setMatches(mql.matches);
    on();
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, [q]);
  return matches;
}

/** Tailwind `lg` (≥1024px): the trainer side switches to its desktop layout (sidebar, side-by-side panes). */
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
