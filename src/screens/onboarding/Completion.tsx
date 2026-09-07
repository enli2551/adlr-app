import type { IntakeData } from '@/lib/types';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui';

export default function Completion({ data, onContinue }: { data: IntakeData; onContinue: () => void }) {
  const goals = data.goals ?? [];
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center adlr-fade-in">
      <div className="adlr-pop mb-8">
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <circle cx="40" cy="40" r="38" stroke="rgb(var(--adlr-gold))" strokeWidth="2" />
          <path d="M24 42 L36 54 L56 28" stroke="rgb(var(--adlr-gold))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="60" style={{ animation: 'adlr-check 0.6s ease 0.3s forwards', strokeDashoffset: 60 }} />
        </svg>
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-2">Willkommen bei ADLR.</h1>
      <p className="text-white/40 mb-10 max-w-xs">Peter wird deinen Plan vorbereiten.</p>

      <div className="adlr-card p-6 w-full max-w-sm text-left mb-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-adlr-gold/20 border border-adlr-gold/30 flex items-center justify-center text-adlr-gold font-bold">
            {(data.firstName?.[0] ?? '?').toUpperCase()}
          </div>
          <div>
            <p className="font-semibold">{data.firstName} {data.lastName}</p>
            <p className="text-xs text-white/40">{data.age} Jahre · {data.heightCm}cm · {data.weightKg}kg</p>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          {goals.length > 0 && (
            <Row label="Ziele" value={goals.join(', ')} />
          )}
          <Row label="Erfahrung" value={data.experience ?? '—'} />
          <Row label="Trainingstage" value={(data.trainingDays ?? []).length + ' Tage/Woche'} />
          <Row label="Commitment" value={`${data.commitmentLevel ?? 3}/5`} />
        </div>
      </div>

      <Button onClick={onContinue} className="w-full max-w-sm">Zum Dashboard</Button>
      <p className="text-xs text-white/30 mt-6">Steig auf. Bleib stark.</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-white/40">{label}</span>
      <span className="text-white/80 text-right max-w-[60%]">{value}</span>
    </div>
  );
}
