import { useState } from 'react';
import { Plus, Pencil, Archive, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';
import { KIND_LABEL, fmtEUR, type Package, type PackageKind } from '@/lib/business';

interface Props {
  packages: Package[];
  onChange: () => void;
}

const EMPTY = { name: '', kind: 'pack' as PackageKind, price: '', sessions: '10', weeks: '12' };

/** Trainer's price list: single sessions, session packs, monthly subscriptions. */
export default function PackageCatalog({ packages, onChange }: Props) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const startNew = () => { setForm(EMPTY); setEditing('new'); setErr(null); };
  const startEdit = (p: Package) => {
    setForm({ name: p.name, kind: p.kind, price: String(p.price), sessions: p.sessions_included ? String(p.sessions_included) : '', weeks: p.validity_weeks ? String(p.validity_weeks) : '' });
    setEditing(p.id); setErr(null);
  };
  const save = async () => {
    const price = Number(form.price.replace(',', '.'));
    if (!form.name.trim() || !(price >= 0) || form.price === '') { setErr(t('Name und Preis angeben.')); return; }
    const row = {
      name: form.name.trim(),
      kind: form.kind,
      price,
      sessions_included: form.kind === 'pack' && form.sessions ? Number(form.sessions) : null,
      validity_weeks: form.kind !== 'single' && form.weeks ? Number(form.weeks) : null,
    };
    const { error } = editing === 'new'
      ? await supabase.from('packages').insert(row)
      : await supabase.from('packages').update(row).eq('id', editing!);
    if (error) { setErr(t('Speichern fehlgeschlagen (Migration ausgeführt?)')); return; }
    setEditing(null);
    onChange();
  };
  const setActive = async (p: Package, active: boolean) => {
    await supabase.from('packages').update({ active }).eq('id', p.id);
    onChange();
  };

  const list = packages.filter((p) => p.active || showArchived);
  const perSession = (p: Package) => (p.kind === 'pack' && p.sessions_included ? p.price / p.sessions_included : null);

  const input = 'w-full bg-inset border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none';
  const formView = (
    <div className="rounded-xl p-3 mb-2 space-y-2 adlr-fade-in" style={{ background: 'rgb(var(--text) / 0.04)' }}>
      <div className="flex gap-1.5">
        {(Object.keys(KIND_LABEL) as PackageKind[]).map((k) => (
          <button key={k} onClick={() => setForm({ ...form, kind: k })} className="adlr-tap flex-1 py-1.5 rounded-lg text-xs font-medium border"
            style={form.kind === k ? { background: 'rgb(var(--adlr-gold))', color: '#000', borderColor: 'rgb(var(--adlr-gold))' } : { color: 'rgb(var(--text) / 0.6)', borderColor: 'rgb(var(--text) / 0.12)' }}>
            {t(KIND_LABEL[k])}
          </button>
        ))}
      </div>
      <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder={form.kind === 'single' ? t('z.B. Personal Training 60 Min') : form.kind === 'pack' ? t('z.B. 10er-Block') : t('z.B. Online-Coaching')} />
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[10px] uppercase text-white/40">{form.kind === 'subscription' ? t('€ / Monat') : form.kind === 'single' ? t('€ / Einheit') : t('Preis €')}
          <input className={input + ' mt-1'} inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="70" />
        </label>
        {form.kind === 'pack' && (
          <label className="text-[10px] uppercase text-white/40">{t('Einheiten')}
            <input className={input + ' mt-1'} inputMode="numeric" value={form.sessions} onChange={(e) => setForm({ ...form, sessions: e.target.value })} placeholder="10" />
          </label>
        )}
        {form.kind !== 'single' && (
          <label className="text-[10px] uppercase text-white/40">{t('Gültig (Wochen)')}
            <input className={input + ' mt-1'} inputMode="numeric" value={form.weeks} onChange={(e) => setForm({ ...form, weeks: e.target.value })} placeholder={form.kind === 'pack' ? '12' : '—'} />
          </label>
        )}
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex gap-2">
        <button onClick={save} className="adlr-tap flex-1 py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>{t('Speichern')}</button>
        <button onClick={() => setEditing(null)} className="adlr-tap px-4 py-2 rounded-xl text-sm bg-white/5 text-white/60">{t('Abbrechen')}</button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-white/80">{t('Preisliste')}</p>
        {editing === null && (
          <button onClick={startNew} className="adlr-tap text-adlr-gold text-sm flex items-center gap-1"><Plus size={14} /> {t('Angebot')}</button>
        )}
      </div>
      {editing === 'new' && formView}
      {list.length === 0 && editing === null && (
        <p className="text-sm text-white/35">{t('Lege deine Angebote an — z. B. Einzeltraining, 10er-Block, Online-Coaching. Danach kannst du sie Klienten zuweisen.')}</p>
      )}
      <div className="space-y-1.5">
        {list.map((p) => editing === p.id ? <div key={p.id}>{formView}</div> : (
          <div key={p.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${p.active ? '' : 'opacity-45'}`} style={{ background: 'rgb(var(--text) / 0.03)' }}>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/85 truncate">{p.name}</p>
              <p className="text-[11px] text-white/40">
                {t(KIND_LABEL[p.kind])}
                {p.sessions_included ? ` · ${t('{n} Einheiten', { n: p.sessions_included })}` : ''}
                {p.validity_weeks ? ` · ${t('{n} Wochen', { n: p.validity_weeks })}` : ''}
                {perSession(p) != null ? ` · ${t('{price} / Einheit', { price: fmtEUR(perSession(p)!) })}` : ''}
              </p>
            </div>
            <p className="text-sm font-bold text-adlr-gold shrink-0">{fmtEUR(p.price)}{p.kind === 'subscription' ? t('/Mo') : ''}</p>
            <button onClick={() => startEdit(p)} aria-label={t('Bearbeiten')} className="adlr-tap p-1 text-white/35"><Pencil size={13} /></button>
            <button onClick={() => setActive(p, !p.active)} aria-label={p.active ? t('Archivieren') : t('Reaktivieren')} className="adlr-tap p-1 text-white/35">
              {p.active ? <Archive size={13} /> : <RotateCcw size={13} />}
            </button>
          </div>
        ))}
      </div>
      {packages.some((p) => !p.active) && (
        <button onClick={() => setShowArchived(!showArchived)} className="adlr-tap w-full pt-2 text-xs text-white/40">
          {showArchived ? t('Archivierte ausblenden') : t('Archivierte anzeigen')}
        </button>
      )}
    </div>
  );
}
