import {
  LayoutDashboard,
  Building2,
  ArrowLeftRight,
  Users,
  TrendingUp,
  Sliders,
  LineChart,
  Landmark,
  FileText,
  BarChart2,
  CalendarDays,
  Calculator,
  Briefcase,
  GitMerge,
  Anchor,
  ClipboardList,
  Scale,
  Sparkles,
} from 'lucide-react';

export type Page =
  | 'dashboard'
  | 'nav-tracker'
  | 'property'
  | 'loanback'
  | 'third-party'
  | 'borrowing'
  | 'employer-investments'
  | 'fund-investments'
  | 'scenarios'
  | 'cashflow'
  | 'trustee-report'
  | 'multi-period-report'
  | 'ten-year-projection'
  | 'valuation-model'
  | 'lender-pack'
  | 'refinance-waterfall'
  | 'lender-pack-bridging'
  | 'lender-pack-term'
  | 'ask-claude';

interface NavItem {
  id: Page;
  label: string;
  icon: React.ElementType;
  group?: string;
}

const items: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview' },
  { id: 'nav-tracker', label: 'NAV Tracker', icon: Scale, group: 'Overview' },
  { id: 'property', label: 'Property Register', icon: Building2, group: 'Registers' },
  { id: 'loanback', label: 'Loanback Register', icon: ArrowLeftRight, group: 'Registers' },
  { id: 'third-party', label: 'Third-Party Loans', icon: Landmark, group: 'Registers' },
  { id: 'borrowing', label: 'Borrowing Register', icon: TrendingUp, group: 'Registers' },
  { id: 'employer-investments', label: 'Employer Investments', icon: Users, group: 'Registers' },
  { id: 'fund-investments', label: 'Fund Investments', icon: TrendingUp, group: 'Registers' },
  { id: 'scenarios', label: 'Scenarios', icon: Sliders, group: 'Planning' },
  { id: 'cashflow', label: 'Cashflow Forecast', icon: LineChart, group: 'Planning' },
  { id: 'ten-year-projection', label: '10-Year Projection', icon: CalendarDays, group: 'Planning' },
  { id: 'valuation-model', label: 'Valuation Model', icon: Calculator, group: 'Analysis' },
  { id: 'lender-pack', label: 'Lender Pack', icon: Briefcase, group: 'Analysis' },
  { id: 'refinance-waterfall', label: 'Refinance Waterfall', icon: GitMerge, group: 'Analysis' },
  { id: 'lender-pack-bridging', label: 'LP — Bridging', icon: Anchor, group: 'Analysis' },
  { id: 'lender-pack-term', label: 'LP — Term', icon: ClipboardList, group: 'Analysis' },
  { id: 'trustee-report', label: 'Trustee Report', icon: FileText, group: 'Reports' },
  { id: 'multi-period-report', label: 'Multi-Period Report', icon: BarChart2, group: 'Reports' },
  { id: 'ask-claude', label: 'Ask Claude', icon: Sparkles, group: 'AI Assistant' },
];

interface NavigationProps {
  current: Page;
  onChange: (p: Page) => void;
}

export default function Navigation({ current, onChange }: NavigationProps) {
  let lastGroup = '';

  return (
    <aside className="w-60 shrink-0 bg-gray-950 flex flex-col min-h-screen">
      {/* Brand */}
      <div className="px-5 py-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center shrink-0">
            <span className="text-white font-black text-sm">RH</span>
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Red Horizons</p>
            <p className="text-gray-400 text-xs">SSAS Planner</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map(item => {
          const showGroup = item.group !== lastGroup;
          lastGroup = item.group ?? '';
          const active = current === item.id;
          const Icon = item.icon;
          return (
            <div key={item.id}>
              {showGroup && (
                <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest px-3 pt-4 pb-1.5">
                  {item.group}
                </p>
              )}
              <button
                onClick={() => onChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left ${
                  active
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon size={16} className="shrink-0" />
                {item.label}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-800">
        <p className="text-gray-600 text-[10px]">© 2026 Red Horizons</p>
      </div>
    </aside>
  );
}
