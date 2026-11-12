import { useCallback, useEffect, useState } from 'react';
import { X, RefreshCw, ExternalLink, SearchCheck } from 'lucide-react';
import { getOrders, verifyPayment } from '../api.js';
import { PROVIDERS, STATES, safeCheckoutUrl, soles, usd } from '../utils/payments.js';

const CAN_VERIFY = ['pendiente', 'procesando', 'revision'];

export default function OrdersModal({ isOpen, onClose, onPaid }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState('');
  const [feedback, setFeedback] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    return getOrders()
      .then(setOrders)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (isOpen) { setFeedback({}); load(); } }, [isOpen, load]);

  if (!isOpen) return null;

  async function verify(order) {
    setChecking(order._id);
    setFeedback(prev => ({ ...prev, [order._id]: '' }));
    try {
      const { pedido, sinPago } = await verifyPayment(order._id);
      setOrders(prev => prev.map(o => (o._id === pedido._id ? pedido : o)));
      if (pedido.estado === 'pagado') onPaid?.();
      setFeedback(prev => ({ ...prev, [order._id]: sinPago ? 'La pasarela todavía no registra un pago para este pedido.' : '' }));
    } catch (e) {
      setFeedback(prev => ({ ...prev, [order._id]: e.message }));
    } finally {
      setChecking('');
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <aside className="cart-panel orders-panel" role="dialog" aria-modal="true" aria-labelledby="orders-title" onMouseDown={e => e.stopPropagation()}>
        <div className="cart-title">
          <div>
            <h2 id="orders-title">Mis pedidos</h2>
            <p>Últimos 30 pedidos · solo pruebas, sin cobros reales</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X /></button>
        </div>

        <div className="panel-body">
          {loading && !orders.length && <p className="inline-note">Cargando pedidos…</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {!loading && !error && !orders.length && <p className="inline-note">Aún no tienes pedidos.</p>}

          {orders.map(order => {
            const resume = order.estado === 'pendiente' && safeCheckoutUrl(order.proveedor, order.checkoutUrl);
            return (
              <article className="order-card" key={order._id}>
                <header>
                  <span className={`badge state-${order.estado}`}>{STATES[order.estado] || order.estado}</span>
                  <b>{soles(order.totalCentimos)}</b>
                </header>
                <small>
                  {new Date(order.createdAt).toLocaleString('es-PE')} · {PROVIDERS[order.proveedor]?.nombre || order.proveedor}
                  {order.cobro?.moneda === 'USD' && ` · cobro ${usd(order.cobro.centavos)}`}
                </small>
                <ul>{order.items.map(item => <li key={item.producto}>{item.nombre} × {item.cantidad}</li>)}</ul>
                {order.mensaje && <p>{order.mensaje}</p>}
                {order.cargoId && <p className="mono">Operación: {order.cargoId}</p>}
                {feedback[order._id] && <p className="inline-note">{feedback[order._id]}</p>}
                {(resume || (CAN_VERIFY.includes(order.estado) && order.referenciaExterna)) && (
                  <div className="panel-actions">
                    {resume && <a className="ghost-btn" href={resume}><ExternalLink size={15} /> Continuar pago</a>}
                    {order.referenciaExterna && CAN_VERIFY.includes(order.estado) && (
                      <button className="ghost-btn" disabled={checking === order._id} onClick={() => verify(order)}>
                        <SearchCheck size={15} /> {checking === order._id ? 'Verificando…' : 'Verificar pago'}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <div className="cart-bottom">
          <button className="checkout" disabled={loading} onClick={load}><RefreshCw size={17} /> Actualizar</button>
        </div>
      </aside>
    </div>
  );
}
