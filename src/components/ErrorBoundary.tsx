import { Component, type ReactNode } from 'react';

interface State { error: Error | null }

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('Propentra crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif', padding: 24, background: '#f8fafc',
        }}>
          <div style={{ maxWidth: 480, textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0a1f33', marginBottom: 8 }}>
              Something went wrong
            </h1>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 12 }}>
              Propentra hit an error while loading. Try reloading the page. If it keeps happening,
              open your browser's developer console (F12 → Console tab) and check the error below.
            </p>
            <pre style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12,
              fontSize: 12, color: '#dc2626', textAlign: 'left', overflowX: 'auto',
            }}>
              {this.state.error.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16, background: '#0a84ff', color: '#fff', border: 'none',
                borderRadius: 8, padding: '8px 16px', fontSize: 14, cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
