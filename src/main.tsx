import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import ErrorBoundary from '@/components/ErrorBoundary';
import { seedIfEmpty } from '@/lib/db';
import { watchCurrencySettings } from '@/lib/currency';

watchCurrencySettings();

function render() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

function renderOnce() {
  if (document.getElementById('root')?.dataset.mounted) return;
  document.getElementById('root')!.dataset.mounted = 'true';
  render();
}

function timeout(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

Promise.race([
  seedIfEmpty().catch((err) => console.error('Seeding failed (app will still load):', err)),
  timeout(3000).then(() => console.warn('Propentra: startup is taking unusually long (database may be blocked by another tab) - loading the app shell anyway.')),
])
  .catch((err) => console.error('Unexpected startup error (app will still load):', err))
  .finally(renderOnce);

