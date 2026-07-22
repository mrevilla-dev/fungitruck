export default function LoadingPlaceholder() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '50vh',
      color: 'var(--text-secondary)',
      fontSize: '1rem',
      gap: '0.75rem',
    }}>
      <div style={{
        border: '3px solid var(--border-color)',
        borderTop: '3px solid var(--primary-color)',
        borderRadius: '50%',
        width: '24px',
        height: '24px',
        animation: 'spin 0.8s linear infinite',
      }} /> Cargando...
    </div>
  );
}
