import { ShoppingBag, ArrowRight, Minus, Plus, Trash2, X, Package } from 'lucide-react';
import { money } from '../utils/format.js';

export default function CartDrawer({ isOpen, onClose, items, count, total, onAdjust }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <aside className="cart-panel" onMouseDown={e => e.stopPropagation()}>
        <div className="cart-title">
          <div>
            <h2>Mi carrito</h2>
            <p>{count} producto(s) seleccionado(s)</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>

        <div className="cart-items">
          {!items.length ? (
            <div className="empty-cart">
              <ShoppingBag size={52} />
              <h3>Tu carrito está vacío</h3>
              <p>Agrega productos de nuestro catálogo.</p>
            </div>
          ) : (
            items.map(({ producto: p, qty }) => (
              <div className="cart-item" key={p._id}>
                <div className="cart-thumbnail">
                  {p.imagen ? <img src={p.imagen} alt="" /> : <Package />}
                </div>
                <div className="cart-item-info">
                  <b>{p.nombre}</b>
                  <span>{money(p.precio)}</span>
                  <div className="qty">
                    <button onClick={() => onAdjust(p, -1)} aria-label="Restar">
                      <Minus size={14} />
                    </button>
                    {qty}
                    <button onClick={() => onAdjust(p, 1)} aria-label="Sumar">
                      <Plus size={14} />
                    </button>
                    <button className="trash" onClick={() => onAdjust(p, -qty)} aria-label="Eliminar">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="cart-bottom">
          <div className="total">
            <span>Subtotal</span>
            <b>{money(total)}</b>
          </div>
          <p>Demostración académica: no incluye pago ni pedidos reales.</p>
          <button
            disabled={!items.length}
            className="checkout"
            onClick={() => alert('Este es un proyecto educativo: el proceso de compra no está implementado.')}
          >
            Continuar (demostración) <ArrowRight size={18} />
          </button>
        </div>
      </aside>
    </div>
  );
}