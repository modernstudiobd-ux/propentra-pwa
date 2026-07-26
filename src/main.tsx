import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import ErrorBoundary from '@/components/ErrorBoundary';
import { seedIfEmpty } from '@/lib/db';

function render() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

seedIfEmpty()
  .catch((err) => console.error('Seeding failed (app will still load):', err))
  .finally(render);

