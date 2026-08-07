import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Buildings from '@/pages/Buildings';
import Flats from '@/pages/Flats';
import Residents from '@/pages/Residents';
import BillGenerator from '@/pages/BillGenerator';
import BillsHistory from '@/pages/BillsHistory';
import Payments from '@/pages/Payments';
import Reports from '@/pages/Reports';
import SettingsPage from '@/pages/Settings';
import BackupRestore from '@/pages/BackupRestore';
import Help from '@/pages/Help';
import SetupWizard from '@/pages/SetupWizard';

function SetupRoute() {
  const navigate = useNavigate();
  return <SetupWizard onFinish={() => navigate('/')} />;
}

// HashRouter is used so the app works correctly on GitHub Pages
// (no server-side rewrite rules needed for client-side routing).
export default function App() {
  const settings = useLiveQuery(() => db.settings.toCollection().first(), []);
  const buildingCount = useLiveQuery(() => db.buildings.count(), []);

  // Whether to auto-show the wizard is decided ONCE, the first time data is
  // available - not re-derived live. If it stayed a live reactive check, the
  // wizard's own "add your first building" step would flip buildingCount to
  // 1 mid-flow, which would make this condition false and instantly boot
  // the person out to the Dashboard before they finished setup.
  const [showWizard, setShowWizard] = useState<boolean | null>(null);

  useEffect(() => {
    if (showWizard !== null) return; // decision already locked in
    if (settings === undefined || buildingCount === undefined) return; // still loading
    const needsOnboarding = !settings.onboardingComplete && !settings.companyName?.trim() && buildingCount === 0;
    setShowWizard(needsOnboarding);
  }, [settings, buildingCount, showWizard]);

  if (showWizard === null) return null; // brief initial load, avoids a flash of the wrong screen

  if (showWizard) {
    return <SetupWizard onFinish={() => setShowWizard(false)} />;
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/setup" element={<SetupRoute />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/buildings" element={<Buildings />} />
          <Route path="/flats" element={<Flats />} />
          <Route path="/residents" element={<Residents />} />
          <Route path="/billing/generator" element={<BillGenerator />} />
          <Route path="/billing/history" element={<BillsHistory />} />
          <Route path="/billing/payments" element={<Payments />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/backup" element={<BackupRestore />} />
          <Route path="/help" element={<Help />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
