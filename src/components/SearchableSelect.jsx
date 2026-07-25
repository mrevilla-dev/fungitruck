import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

/**
 * SearchableSelect - A premium, mobile-first, gloved-operator friendly autocomplete dropdown.
 * - Sorts items alphabetically case-insensitive.
 * - Filters items reactively in real time.
 * - Lists items with a minimum 48px touch target.
 * - Displays a dynamic "+ Crear nuevo" button when search result is empty.
 */
export default function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = '-- Seleccionar --',
  onCreateNew,
  createNewText = '➕ Crear nuevo',
  hasWarning = false,
  style = {},
  renderOption = null
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close dropdown if clicked outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Alphabetical sort (A-Z, case-insensitive)
  const sortedOptions = React.useMemo(() => {
    return [...options].sort((a, b) => {
      const nameA = (a.nombre || '').toLowerCase();
      const nameB = (b.nombre || '').toLowerCase();
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  }, [options]);

  // Reactive filtering
  const filteredOptions = React.useMemo(() => {
    const normalize = (str) => (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const query = normalize(search).trim();
    if (!query) return sortedOptions;
    
    const terms = query.split(/\s+/);
    return sortedOptions.filter(opt => {
      const target = normalize(opt.nombre);
      return terms.every(term => target.includes(term));
    });
  }, [sortedOptions, search]);

  const selectedOption = options.find(opt => opt.id === value);

  const handleSelect = (optionId) => {
    onChange(optionId);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div 
      ref={containerRef} 
      className="searchable-select-container" 
      style={{ 
        position: 'relative', 
        width: '100%', 
        ...style 
      }}
    >
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          position: 'relative', 
          width: '100%' 
        }}
      >
        <input
          type="text"
          className="form-control"
          placeholder={placeholder}
          value={isOpen ? search : (selectedOption?.nombre || '')}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setSearch('');
            setIsOpen(true);
          }}
          style={{
            width: '100%',
            height: '48px',
            fontSize: '1rem',
            paddingRight: '2.5rem',
            background: 'var(--bg-input, rgba(255,255,255,0.05))',
            color: 'var(--text-primary, #fff)',
            border: hasWarning ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px',
            textOverflow: 'ellipsis'
          }}
        />
        <div 
          onClick={() => setIsOpen(!isOpen)}
          style={{
            position: 'absolute',
            right: '1rem',
            top: '50%',
            transform: 'translateY(-50%)',
            cursor: 'pointer',
            opacity: 0.6,
            fontSize: '0.8rem',
            userSelect: 'none'
          }}
        >
          {isOpen ? '▲' : '▼'}
        </div>
      </div>

      {isOpen && (
        <div 
          className="searchable-select-dropdown animate-fade-in"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#1f2937', // Premium dark mode background
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.5)',
            maxHeight: '260px',
            overflowY: 'auto',
            zIndex: 9999,
            padding: '4px'
          }}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <div
                key={opt.id}
                onClick={() => !opt.disabled && handleSelect(opt.id)}
                style={{
                  height: 'auto',
                  minHeight: '48px',
                  whiteSpace: 'normal',
                  lineHeight: 1.4,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 1rem',
                  cursor: opt.disabled ? 'not-allowed' : 'pointer',
                  borderRadius: '6px',
                  fontSize: '0.95rem',
                  fontWeight: '500',
                  color: opt.disabled ? '#6b7280' : (opt.id === value ? '#10b981' : '#f3f4f6'),
                  opacity: opt.disabled ? 0.5 : 1,
                  background: opt.id === value 
                    ? 'rgba(16, 185, 129, 0.1)' 
                    : 'transparent',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (opt.id !== value && !opt.disabled) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (opt.id !== value && !opt.disabled) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {renderOption ? renderOption(opt, opt.id === value) : (
                  <span style={{ flex: 1 }}>{opt.nombre}</span>
                )}
                {opt.disabled && (
                  <span style={{ fontSize: '0.7rem', color: '#ef4444', marginLeft: '0.5rem', whiteSpace: 'nowrap', fontWeight: 600 }}>
                    Agotado
                  </span>
                )}
              </div>
            ))
          ) : (
            <div style={{ padding: '0.75rem', textAlign: 'center' }}>
              <div 
                style={{ 
                  fontSize: '0.85rem', 
                  color: '#9ca3af', 
                  marginBottom: onCreateNew ? '0.75rem' : 0 
                }}
              >
                No se encontraron resultados
              </div>
              {onCreateNew && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setIsOpen(false);
                    onCreateNew();
                  }}
                  style={{
                    width: '100%',
                    height: '44px',
                    fontSize: '0.9rem',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 6px rgba(16, 185, 129, 0.2)'
                  }}
                >
                  {createNewText}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

SearchableSelect.propTypes = {
  options: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    nombre: PropTypes.string.isRequired,
  })),
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  onCreateNew: PropTypes.func,
  createNewText: PropTypes.string,
  hasWarning: PropTypes.bool,
  style: PropTypes.object,
};
