import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, Users, Menu } from 'lucide-react';

const items = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/billing/generator', label: 'Billing', icon: FileText },
  { to: '/residents', label: 'Residents', icon: Users },
];

export default function BottomNav({ onMore }: { onMore: () => void }) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-100 flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${
              isActive ? 'text-brand-600' : 'text-gray-400'
            }`
          }
        >
          <item.icon size={20} />
          {item.label}
        </NavLink>
      ))}
      <button
        onClick={onMore}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-gray-400"
      >
        <Menu size={20} />
        More
      </button>
    </nav>
  );
}
