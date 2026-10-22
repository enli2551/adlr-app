import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Download, KeyRound, Languages, ListChecks, LogOut, Palette, Sparkles, User, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import BrandingSettings from '@/components/BrandingSettings';
import HapticsToggle from '@/components/HapticsToggle';
import PasswordChange from '@/components/PasswordChange';
import DataExport from '@/components/DataExport';

type Section = 'name' | 'look' | 'brand' | 'password' | 'export' | null;

function Row({ open, onToggle, icon: Icon, title, hint, children }: { open: boolean; onToggle: () => void; icon: typeof User; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl" style={{ background: 'rgb(var(--text) / 0.04)' }}>
      <button onClick={onToggle} className="adlr-tap w-full flex items-center gap-3 px-3.5 py-3 text-left" aria-expanded={open}>
        <Icon size={17} className="text-adlr-gold shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-white">{title}</span>
          {hint && <span className="block text-[11px] text-white/40 truncate">{hint}</span>}
        </span>
        <ChevronDown size={16} className="text-white/35 transition-transform shrink-0" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && <div className="px-3.5 pb-3.5 adlr-fade-in">{children}</div>}
    </div>
  );
}

/** Coach account menu as a sheet: short collapsible sections and "Abmelden" always visible
 *  at the bottom. (The old dropdown lived in the header — on phones its lower part, including
 *  the logout, slid under the bottom navigation and couldn't be tapped.) */
export default function TrainerAccountSheet({ onClose, onQuestions, onSignOut }: {
  onClose: () => void;
  onQuestions: () => void;
  onSignOut: () => void;
}) {
  const { profile, refreshProfile } = useAuth();
  const [open, setOpen] = useState<Section>(null);
  const [nameDraft, setNameDraft] = useState(profile?.first_name ?? '');
  const [savingName, setSavingName] = useState(false);
  const nameDirty = nameDraft.trim() !== '' && nameDraft.trim() !== (profile?.first_name ?? '');

  const saveName = async () => {
    if (!profile || !nameDirty) return;
    setSavingName(true);
    await supabase.from('profiles').update({ first_name: nameDraft.trim() }).eq('id', profile.id);
    await refreshProfile();
    setSavingName(false);
  };

  const sec = (id: Exclude<Section, null>) => ({ open: open === id, onToggle: () => setOpen(open === id ? null : id) });

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-end sm:items-center justify-center adlr-fade-in" onClick={onClose}>
      <div className="w-full max-w-md max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-adlr-anthracite" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <div className="w-11 h-11 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold font-bold shrink-0">
            {(profile?.first_name?.[0] ?? 'C').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-white truncate">{profile?.first_name || t('Coach')}</p>
            <p className="text-xs text-white/45 truncate">{profile?.email}</p>
          </div>
          <button onClick={onClose} aria-label={t('Schließen')} className="adlr-tap p-1.5 text-white/40"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-2">
          <Row {...sec('name')} icon={User} title={t('Dein Name')} hint={t('Für Klienten sichtbar')}>
            <div className="flex gap-1.5">
              <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }} placeholder={t('Vorname')}
                className="flex-1 min-w-0 bg-inset border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 outline-none" />
              {nameDirty && (
                <button onClick={saveName} disabled={savingName} className="adlr-tap px-3 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: 'rgb(var(--adlr-gold))', color: '#000' }}>OK</button>
              )}
            </div>
          </Row>
          <Row {...sec('look')} icon={Palette} title={t('Darstellung & Sprache')}>
            <ThemeSwitcher />
            <div className="flex items-center gap-2 mt-4 mb-2">
              <Languages size={14} className="text-adlr-gold" />
              <p className="text-xs font-medium uppercase tracking-wider text-white/50">{t('Sprache')}</p>
            </div>
            <LanguageSwitcher />
            <HapticsToggle />
          </Row>
          <button onClick={onQuestions} className="adlr-tap w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left" style={{ background: 'rgb(var(--text) / 0.04)' }}>
            <ListChecks size={17} className="text-adlr-gold shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-white">{t('Eigene Fragen')}</span>
              <span className="block text-[11px] text-white/40">{t('Kennenlernen & wöchentlicher Check-in')}</span>
            </span>
          </button>
          <Row {...sec('password')} icon={KeyRound} title={t('Passwort ändern')}>
            <PasswordChange onDone={() => setOpen(null)} />
          </Row>
          <Row {...sec('export')} icon={Download} title={t('Meine Daten exportieren')}>
            <DataExport />
          </Row>
          {/* Branding last: it changes every client's app */}
          <Row {...sec('brand')} icon={Sparkles} title={t('Branding')} hint={t('Logo & Farbe in der App deiner Klienten')}>
            <BrandingSettings embedded />
          </Row>
        </div>

        <div className="px-5 pt-3 border-t border-white/10" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
          <button onClick={onSignOut} className="adlr-tap w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-red-400" style={{ background: 'rgb(239 68 68 / 0.1)' }}>
            <LogOut size={16} /> {t('Abmelden')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
