import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import { installGlobalTapHaptics } from '@/lib/haptics';
import AuthScreen from '@/screens/AuthScreen';
import Onboarding from '@/screens/Onboarding';
import ClientLayout from '@/screens/client/ClientLayout';
import PlanScreen from '@/screens/client/PlanScreen';
import ProgressScreen from '@/screens/client/ProgressScreen';
import NutritionScreen from '@/screens/client/NutritionScreen';
import CoachScreen from '@/screens/client/CoachScreen';
import UpgradesScreen from '@/screens/client/UpgradesScreen';
import ProfileScreen from '@/screens/client/ProfileScreen';
import TrainerLayout from '@/screens/trainer/TrainerLayout';
import OverviewScreen from '@/screens/trainer/OverviewScreen';
import ClientsHub from '@/screens/trainer/ClientsHub';
import PlanBuilderScreen from '@/screens/trainer/PlanBuilderScreen';
import MessagesScreen from '@/screens/trainer/MessagesScreen';
import BusinessScreen from '@/screens/trainer/BusinessScreen';
import Logo from '@/components/Logo';
import { Loading } from '@/components/ui';

function ProtectedClient({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/auth" replace state={{ from: loc }} />;
  if (profile?.role === 'trainer') return <Navigate to="/trainer" replace />;
  if (!profile?.intake_completed) return <Navigate to="/onboarding" replace />;
  return <ClientLayout>{children}</ClientLayout>;
}

function ProtectedTrainer({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/trainer-auth" replace />;
  if (profile?.role !== 'trainer') return <Navigate to="/app" replace />;
  return <TrainerLayout>{children}</TrainerLayout>;
}

function Splash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center adlr-fade-in">
      <Logo size={40} showTagline />
      <div className="mt-8">
        <Loading />
      </div>
    </div>
  );
}

export default function App() {
  useEffect(() => { installGlobalTapHaptics(); }, []);
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/auth" replace />} />
          <Route path="/auth" element={<AuthScreen />} />
          <Route path="/trainer-auth" element={<AuthScreen />} />

          <Route path="/onboarding" element={<OnboardingGate />} />

          {/* Client */}
          <Route path="/app" element={<ProtectedClient><PlanScreen /></ProtectedClient>} />
          <Route path="/app/fortschritt" element={<ProtectedClient><ProgressScreen /></ProtectedClient>} />
          <Route path="/app/ernaehrung" element={<ProtectedClient><NutritionScreen /></ProtectedClient>} />
          <Route path="/app/coach" element={<ProtectedClient><CoachScreen /></ProtectedClient>} />
          <Route path="/app/upgrades" element={<ProtectedClient><UpgradesScreen /></ProtectedClient>} />
          <Route path="/app/profil" element={<ProtectedClient><ProfileScreen /></ProtectedClient>} />

          {/* Trainer */}
          <Route path="/trainer" element={<ProtectedTrainer><OverviewScreen /></ProtectedTrainer>} />
          <Route path="/trainer/klienten" element={<ProtectedTrainer><ClientsHub /></ProtectedTrainer>} />
          <Route path="/trainer/plan-builder" element={<ProtectedTrainer><PlanBuilderScreen /></ProtectedTrainer>} />
          <Route path="/trainer/kalender" element={<Navigate to="/trainer/klienten?view=kalender" replace />} />
          <Route path="/trainer/nachrichten" element={<ProtectedTrainer><MessagesScreen /></ProtectedTrainer>} />
          <Route path="/trainer/business" element={<ProtectedTrainer><BusinessScreen /></ProtectedTrainer>} />

          <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function OnboardingGate() {
  const { session, loading } = useAuth();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/auth" replace />;
  return <Onboarding />;
}
