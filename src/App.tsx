import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Buildings from '@/pages/Buildings';
import Flats from '@/pages/Flats';
import Tenants from '@/pages/Tenants';
import BillGenerator from '@/pages/BillGenerator';
import BillsHistory from '@/pages/BillsHistory';
import Payments from '@/pages/Payments';
import Reports from '@/pages/Reports';
import SettingsPage from '@/pages/Settings';
import BackupRestore from '@/pages/BackupRestore';

// HashRouter is used so the app works correctly on GitHub Pages
// (no server-side rewrite rules needed for client-side routing).
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/buildings" element={<Buildings />} />
          <Route path="/flats" element={<Flats />} />
          <Route path="/tenants" element={<Tenants />} />
          <Route path="/billing/generator" element={<BillGenerator />} />
          <Route path="/billing/history" element={<BillsHistory />} />
          <Route path="/billing/payments" element={<Payments />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/backup" element={<BackupRestore />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
