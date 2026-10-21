import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Loader2, Plus, ScanBarcode, Search, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { lookupBarcode, myFoods, recentFoods, searchBase, searchOff, type Food } from '@/lib/food';
import { scanBarcode, canScan } from '@/lib/barcode';
import { t, fmtNum } from '@/lib/i18n';

/** Full-screen food picker: recent & own foods, then search (basic foods instantly,
 *  packaged products from Open Food Facts after a short pause), barcode, own food. */
export default function FoodSearch({ clientId, title, onPick, onClose }: {
  clientId: string;
  title: string;
  onPick: (food: Food, grams?: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<(Food & { last_g: number })[]>([]);
  const [own, setOwn] = useState<Food[]>([]);
  const [base, setBase] = useState<Food[]>([]);
  const [off, setOff] = useState<Food[] | null>(null);
  const [offBusy, setOffBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    recentFoods(clientId).then(setRecent).catch(() => {});
    myFoods().then(setOwn).catch(() => {});
  }, [clientId]);

  useEffect(() => {
    const query = q.trim();
    const my = ++seq.current;
    if (!query) { setBase([]); setOff(null); return; }
    searchBase(query).then((r) => { if (my === seq.current) setBase(r); });
    setOff(null);
    if (query.length < 3) return;
    const timer = setTimeout(async () => {
      setOffBusy(true);
      const r = await searchOff(query);
      if (my === seq.current) { setOff(r); setOffBusy(false); }
    }, 550);
    return () => clearTimeout(timer);
  }, [q]);

  const ownHits = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? own.filter((f) => f.name.toLowerCase().includes(n)) : [];
  }, [own, q]);

  const scan = async () => {
    setScanMsg(null);
    const code = await scanBarcode();
    if (!code) return;
    setScanMsg(t('Suche Produkt …'));
    const food = await lookupBarcode(code);
    if (food) { setScanMsg(null); onPick(food); }
    else setScanMsg(t('Produkt {code} nicht gefunden — lege es als eigenes Lebensmittel an.', { code }));
  };

  const row = (f: Food, extra?: string) => (
    <button key={`${f.source}:${f.id}`} onClick={() => onPick(f, (f as Food & { last_g?: number }).last_g)}
      className="adlr-tap w-full flex items-center gap-3 px-3 py-2.5 text-left" style={{ borderTop: '1px solid rgb(var(--text) / 0.05)' }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/90 truncate">{f.name}</p>
        <p className="text-[11px] text-white/40 truncate">{[f.brand, extra, `${fmtNum(f.per100.kcal)} kcal / 100 g`].filter(Boolean).join(' · ')}</p>
      </div>
      <Plus size={16} className="text-adlr-gold shrink-0" />
    </button>
  );
  const section = (label: string, items: React.ReactNode, right?: React.ReactNode) => (
    <div className="adlr-card overflow-hidden mb-3">
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <p className="text-[11px] uppercase tracking-wider text-white/40">{label}</p>{right}
      </div>
      {items}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[75] flex flex-col bg-adlr-black adlr-fade-in" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="max-w-md w-full mx-auto flex flex-col flex-1 min-h-0 px-4">
        <div className="flex items-center gap-2 py-3">
          <button onClick={onClose} className="adlr-tap -ml-2 p-2 text-white/70 flex items-center gap-1 text-sm" aria-label={t('Zurück')}><ChevronLeft size={20} /></button>
          <p className="flex-1 text-lg font-semibold text-white truncate">{title}</p>
        </div>
        <div className="flex gap-2 mb-3">
          <div className="flex-1 flex items-center gap-2 bg-inset border border-white/10 rounded-xl px-3 py-2.5">
            <Search size={16} className="text-white/35" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Lebensmittel suchen …')} className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-white/30 outline-none" />
          </div>
          {canScan() && (
            <button onClick={scan} aria-label={t('Barcode scannen')} className="adlr-tap w-12 rounded-xl flex items-center justify-center" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}><ScanBarcode size={20} /></button>
          )}
        </div>
        {scanMsg && <p className="text-xs text-white/60 mb-3">{scanMsg}</p>}

        <div className="flex-1 min-h-0 overflow-y-auto pb-4">
          {creating ? (
            <CustomFoodForm initialName={q} onCancel={() => setCreating(false)} onSaved={(f) => { setCreating(false); onPick(f); }} />
          ) : !q.trim() ? (
            <>
              {recent.length > 0 && section(t('Zuletzt gegessen'), recent.slice(0, 15).map((f) => row(f, `${fmtNum(f.last_g)} g`)))}
              {own.length > 0 && section(t('Meine Lebensmittel'), own.map((f) => row(f)))}
              {recent.length === 0 && own.length === 0 && (
                <p className="text-sm text-white/45 text-center py-10 px-6">{t('Tippe, was du gegessen hast — z. B. „Haferflocken" oder „Skyr" — oder scanne den Barcode der Packung.')}</p>
              )}
            </>
          ) : (
            <>
              {ownHits.length > 0 && section(t('Meine Lebensmittel'), ownHits.map((f) => row(f)))}
              {base.length > 0 && section(t('Grundnahrungsmittel'), base.map((f) => row(f)))}
              {section(t('Produkte (Open Food Facts)'), (
                off === null ? (
                  q.trim().length < 3 ? <p className="text-xs text-white/35 px-3 pb-3">{t('Ab 3 Buchstaben …')}</p>
                    : <p className="text-xs text-white/40 px-3 pb-3 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> {t('Suche …')}</p>
                ) : off.length === 0 ? (
                  <p className="text-xs text-white/40 px-3 pb-3">{offBusy ? t('Suche …') : t('Nichts gefunden (oder offline).')}</p>
                ) : off.map((f) => row(f))
              ))}
            </>
          )}
          {!creating && (
            <button onClick={() => setCreating(true)} className="adlr-tap w-full py-3 rounded-xl text-sm font-medium border border-dashed text-adlr-gold flex items-center justify-center gap-1.5" style={{ borderColor: 'rgb(var(--adlr-gold) / 0.4)' }}>
              <Star size={14} /> {t('Eigenes Lebensmittel anlegen')}
            </button>
          )}
          <p className="text-[10px] text-white/30 text-center mt-4">{t('Produktdaten: Open Food Facts (ODbL) · Grundnahrungsmittel: USDA FoodData Central')}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CustomFoodForm({ initialName, onSaved, onCancel }: { initialName: string; onSaved: (f: Food) => void; onCancel: () => void }) {
  const [f, setF] = useState({ name: initialName, brand: '', kcal: '', protein: '', carbs: '', fat: '', serving: '' });
  const [err, setErr] = useState<string | null>(null);
  const num = (s: string) => Number(s.replace(',', '.'));
  const save = async () => {
    if (!f.name.trim() || !(num(f.kcal) >= 0) || f.kcal === '') { setErr(t('Name und kcal sind Pflicht.')); return; }
    const { data, error } = await supabase.from('custom_foods').insert({
      name: f.name.trim(), brand: f.brand.trim() || null, kcal_100: num(f.kcal),
      protein_100: num(f.protein) || 0, carbs_100: num(f.carbs) || 0, fat_100: num(f.fat) || 0,
      serving_g: f.serving ? num(f.serving) : null,
    }).select('*').single();
    if (error || !data) { setErr(t('Konnte nicht gespeichert werden.')); return; }
    const r = data as { id: string; name: string; brand: string | null; kcal_100: number; protein_100: number; carbs_100: number; fat_100: number; serving_g: number | null };
    onSaved({ source: 'custom', id: r.id, name: r.name, brand: r.brand, per100: { kcal: Number(r.kcal_100), protein: Number(r.protein_100), carbs: Number(r.carbs_100), fat: Number(r.fat_100) }, serving_g: r.serving_g });
  };
  const input = 'w-full bg-inset border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none';
  return (
    <div className="adlr-card p-4 space-y-2.5 mb-3">
      <p className="text-sm font-semibold text-white">{t('Eigenes Lebensmittel')}</p>
      <p className="text-[11px] text-white/45">{t('Werte pro 100 g — steht auf der Packung unter „Nährwerte".')}</p>
      <input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('Name')} />
      <input className={input} value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} placeholder={t('Marke (optional)')} />
      <div className="grid grid-cols-2 gap-2">
        {([['kcal', 'kcal'], ['protein', 'Protein g'], ['carbs', 'Kohlenhydrate g'], ['fat', 'Fett g']] as const).map(([k, l]) => (
          <input key={k} className={input} inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={t(l)} />
        ))}
      </div>
      <input className={input} inputMode="decimal" value={f.serving} onChange={(e) => setF({ ...f, serving: e.target.value })} placeholder={t('Portion in g (optional)')} />
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex gap-2">
        <button onClick={save} className="adlr-tap flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>{t('Speichern')}</button>
        <button onClick={onCancel} className="adlr-tap px-4 rounded-xl text-sm bg-white/5 text-white/60">{t('Abbrechen')}</button>
      </div>
    </div>
  );
}
