import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { SsasScheme } from './types';
import Navigation, { Page } from './components/Navigation';
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
import AskClaude from './pages/AskClaude';

export default function App() {
  const [scheme, setScheme] = useState<SsasScheme | null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadScheme();
  }, []);

  async function loadScheme() {
    const { data } = await supabase.from('ssas_schemes').select('*').order('created_at').limit(1).maybeSingle();
    if (data) {
      setScheme(data);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-black text-sm">RH</span>
          </div>
          <p className="text-gray-500 text-sm">Loading SSAS Planner…</p>
        </div>
      </div>
    );
  }

  if (!scheme) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">No SSAS scheme found. Please check database connection.</p>
      </div>
    );
  }

  const pageProps = { scheme, onSchemeUpdate: (s: SsasScheme) => setScheme(s) };

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      <Navigation current={page} onChange={setPage} />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {page === 'dashboard' && <Dashboard {...pageProps} />}
          {page === 'nav-tracker' && <NavTracker scheme={scheme} />}
          {page === 'property' && <PropertyRegister scheme={scheme} />}
          {page === 'loanback' && <LoanbackRegister scheme={scheme} />}
          {page === 'third-party' && <ThirdPartyLoanRegister scheme={scheme} />}
          {page === 'borrowing' && <BorrowingRegister scheme={scheme} />}
          {page === 'employer-investments' && <EmployerInvestments scheme={scheme} />}
          {page === 'fund-investments' && <FundInvestments scheme={scheme} />}
          {page === 'scenarios' && <Scenarios scheme={scheme} />}
          {page === 'cashflow' && <CashflowForecast scheme={scheme} />}
          {page === 'trustee-report' && <TrusteeReport scheme={scheme} />}
          {page === 'multi-period-report' && <MultiPeriodReport scheme={scheme} />}
          {page === 'ten-year-projection' && <TenYearProjection scheme={scheme} />}
          {page === 'valuation-model' && <ValuationModel scheme={scheme} />}
          {page === 'lender-pack' && <LenderPack scheme={scheme} />}
          {page === 'refinance-waterfall' && <RefinanceWaterfall scheme={scheme} />}
          {page === 'lender-pack-bridging' && <LenderPackBridging scheme={scheme} />}
          {page === 'lender-pack-term' && <LenderPackTerm scheme={scheme} />}
          {page === 'ask-claude' && <AskClaude scheme={scheme} />}
        </div>
      </main>
    </div>
  );
}
