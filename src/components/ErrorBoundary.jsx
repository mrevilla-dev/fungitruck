import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary capturó:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ marginBottom: '0.5rem', color: '#ef4444' }}>
            Algo salió mal
          </h2>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem', maxWidth: '400px' }}>
            Ocurrió un error inesperado. Recargá la página o volvé al inicio.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '1rem',
              maxWidth: '600px',
              overflow: 'auto',
              fontSize: '0.75rem',
              color: '#991b1b',
              textAlign: 'left',
              marginBottom: '1.5rem'
            }}>
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
          )}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={this.handleReload} style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}>
              Recargar página
            </button>
            <button onClick={this.handleGoHome} style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              border: 'none',
              background: '#3b82f6',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}>
              Volver al inicio
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
