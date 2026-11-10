import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from './lib/supabase';
import { useAuth } from './lib/AuthContext';
import { SsasScheme } from './types';
import Navigation, { Page } from './components/Navigation';
import SignIn from './pages/SignIn';
import SetPassword from './pages/SetPassword';
import UsersAccess from './pages/UsersAccess';
import PlannerSharing from './pages/PlannerSharing';
import Dashboard from './pages/Dashboard';
import PropertyRegister from './pages/PropertyRegister';
import LoanbackRegister from './pages/LoanbackRegister';
import ThirdPartyLoanRegister from './pages/ThirdPartyLoanRegister';
import BorrowingRegister from './pages/BorrowingRegister';
import EmployerInvestments from './pages/EmployerInvestments';
import FundInvestments from './pages/FundInvestments';
import Scenarios from './pages/Scenarios';
import CashflowForecast from './pages/CashflowForecast';
import TrusteeReport from './pages/TrusteeReport';
import MultiPeriodReport from './pages/MultiPeriodReport';
import TenYearProjection from './pages/TenYearProjection';
import ValuationModel from './pages/ValuationModel';
import LenderPack from './pages/LenderPack';
import RefinanceWaterfall from './pages/RefinanceWaterfall';
import LenderPackBridging from './pages/LenderPackBridging';
import LenderPackTerm from './pages/LenderPackTerm';
import NavTracker from './pages/NavTracker';

function FullScreenMessage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-black text-sm">RH</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const { session, profile, profileError, loading: authLoading, recovering, signOut } = useAuth();
  const [scheme, setScheme] = useState<SsasScheme | null>(null);
  const [schemeLoading, setSchemeLoading] = useState(false);
  const [schemeError, setSchemeError] = useState(false);
  const [page, setPage] = useState<Page>('dashboard');

  const userId = session?.user.id ?? null;
  const canUseApp = Boolean(session && profile && profile.is_active && !profile.must_set_password && !recovering);

  useEffect(() => {
    if (!canUseApp || !userId) return;
    let cancelled = false;
    (async () => {
      setSchemeLoading(true);
      setSchemeError(false);
      const { data, error } = await supabase.from('ssas_schemes').select('*').order('created_at');
      if (cancelled) return;
      if (error) {
        setSchemeError(true);
      } else {
        const schemes = (data ?? []) as SsasScheme[];
        setScheme(schemes.find(s => s.owner_id === userId) ?? schemes[0] ?? null);
      }
      setSchemeLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canUseApp, userId]);

  if (authLoading) {
    return (
      <FullScreenMessage>
        <p className="text-gray-500 text-sm">Loading SSAS Planner…</p>
      </FullScreenMessage>
    );
  }

  if (!session) return <SignIn />;

  if (recovering || profile?.must_set_password) return <SetPassword />;

  if (profileError) {
    return (
      <FullScreenMessage>
        <p className="text-gray-700 font-medium">We could not load your account.</p>
        <p className="text-gray-500 text-sm mt-2">Please refresh the page. If this continues, contact Dominic at Red Horizons.</p>
      </FullScreenMessage>
    );
  }

  if (!profile) {
    return (
      <FullScreenMessage>
        <p className="text-gray-700 font-medium">No account profile was found for this sign-in.</p>
        <button onClick={signOut} className="mt-4 text-sm font-medium text-red-600 hover:text-red-700">Sign out</button>
      </FullScreenMessage>
    );
  }

  if (!profile.is_active) {
    return (
      <FullScreenMessage>
        <p className="text-gray-700 font-medium">Your access has been turned off.</p>
        <p className="text-gray-500 text-sm mt-2">Please contact Dominic at Red Horizons if you think this is a mistake.</p>
        <button onClick={signOut} className="mt-4 text-sm font-medium text-red-600 hover:text-red-700">Sign out</button>
      </FullScreenMessage>
    );
  }

  if (schemeLoading || (!scheme && !schemeError)) {
    return (
      <FullScreenMessage>
        <p className="text-gray-500 text-sm">Loading your planner…</p>
      </FullScreenMessage>
    );
  }

  if (schemeError || !scheme) {
    return (
      <FullScreenMessage>
        <p className="text-gray-700 font-medium">
          {schemeError ? 'We could not load your planner.' : 'No planner is available for this account yet.'}
        </p>
        <p className="text-gray-500 text-sm mt-2">Please refresh the page or contact Dominic at Red Horizons.</p>
      </FullScreenMessage>
    );
  }

  const isOwner = scheme.owner_id === profile.user_id;
  const readOnly = !isOwner;
  const isPlannerPage = page !== 'users-access' && page !== 'share-planner';
  const pageProps = { scheme, onSchemeUpdate: (s: SsasScheme) => setScheme(s) };

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      <Navigation
        current={page}
        onChange={setPage}
        plannerName={scheme.name}
        userEmail={profile.email}
        isAdmin={profile.is_admin}
        isOwner={isOwner}
        onSignOut={signOut}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {readOnly && isPlannerPage && (
            <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              You are viewing this planner in read-only mode. You can explore every page and use Ask Claude, but only the owner can make changes.
            </div>
          )}

          {page === 'users-access' && profile.is_admin && <UsersAccess />}
          {page === 'share-planner' && isOwner && <PlannerSharing scheme={scheme} />}

          {isPlannerPage && (
            <fieldset disabled={readOnly && page !== 'scenarios'} className="contents">
              {page === 'dashboard' && <Dashboard {...pageProps} />}
              {page === 'nav-tracker' && <NavTracker scheme={scheme} />}
              {page === 'property' && <PropertyRegister scheme={scheme} />}
              {page === 'loanback' && <LoanbackRegister scheme={scheme} />}
              {page === 'third-party' && <ThirdPartyLoanRegister scheme={scheme} />}
              {page === 'borrowing' && <BorrowingRegister scheme={scheme} />}
              {page === 'employer-investments' && <EmployerInvestments scheme={scheme} />}
              {page === 'fund-investments' && <FundInvestments scheme={scheme} />}
              {page === 'scenarios' && <Scenarios scheme={scheme} readOnly={readOnly} />}
              {page === 'cashflow' && <CashflowForecast scheme={scheme} />}
              {page === 'trustee-report' && <TrusteeReport scheme={scheme} />}
              {page === 'multi-period-report' && <MultiPeriodReport scheme={scheme} />}
              {page === 'ten-year-projection' && <TenYearProjection scheme={scheme} />}
              {page === 'valuation-model' && <ValuationModel scheme={scheme} />}
              {page === 'lender-pack' && <LenderPack scheme={scheme} />}
              {page === 'refinance-waterfall' && <RefinanceWaterfall scheme={scheme} />}
              {page === 'lender-pack-bridging' && <LenderPackBridging scheme={scheme} />}
              {page === 'lender-pack-term' && <LenderPackTerm scheme={scheme} />}
            </fieldset>
          )}
        </div>
      </main>
    </div>
  );
}
