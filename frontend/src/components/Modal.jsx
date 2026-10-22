import { useEffect } from 'react';
export default function Modal({ titulo, onCerrar, ancho = 900, children }) {
  useEffect(() => { const h = (e) => e.key === 'Escape' && onCerrar(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onCerrar]);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal-caja" style={{ width: `min(${ancho}px,100%)` }}>
        <button className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
        {children}
      </div>
    </div>
  );
}
