import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BottomNav from './BottomNav';

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/buildings': 'Buildings',
  '/flats': 'Flats',
  '/residents': 'Residents',
  '/billing/generator': 'Billing Center',
  '/billing/history': 'Bills History',
  '/billing/payments': 'Payments',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/backup': 'Backup & Restore',
  '/help': 'Help',
};

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const title = titles[pathname] ?? 'BuildingBill';

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar title={title} onMenu={() => setOpen(true)} />
        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
      <BottomNav onMore={() => setOpen(true)} />
    </div>
  );
}
