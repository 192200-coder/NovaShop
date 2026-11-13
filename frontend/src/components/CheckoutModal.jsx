import { useEffect, useRef, useState } from 'react';
import { X, ArrowRight, ShieldCheck } from 'lucide-react';
import { createOrder, getPaymentConfig, simulatePayment, startCheckout } from '../api.js';
import { PROVIDERS, STATES, estimateUsd, safeCheckoutUrl, savePendingCheckout, soles, usd } from '../utils/payments.js';

const ORDER = ['mercadopago', 'stripe', 'paypal', 'mock'];

export default function CheckoutModal({ isOpen, items, onClose, onPaid, onShowOrders }) {
  const [config, setConfig] = useState(null);
  const [provider, setProvider] = useState('');
  const [scenario, setScenario] = useState('aprobado');
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const processing = useRef(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    let active = true;
    setOrder(null);
    setError('');
    getPaymentConfig()
      .then(value => {
        if (!active) return;
        setConfig(value);
        setProvider(current => (value.proveedores[current] ? current : ORDER.find(p => value.proveedores[p]) || ''));
      })
      .catch(() => active && setError('No se pudo consultar la configuración de pagos. ¿Está encendido el backend?'));
    return () => { active = false; };
  }, [isOpen]);

  if (!isOpen) return null;

  const totalCentimos = items.reduce((n, { producto, qty }) => n + Math.round(producto.precio * 100) * qty, 0);
  const inUsd = provider === 'stripe' || provider === 'paypal';
  const finished = order && order.estado !== 'pendiente';

  async function pay() {
    if (processing.current || !provider) return;
    processing.current = true;
    setBusy(true);
    setError('');
    let current = null;
    try {
      current = await createOrder(items.map(({ producto, qty }) => ({ producto: producto._id, cantidad: qty })), provider);
      setOrder(current);
      if (provider === 'mock') {
        const result = await simulatePayment(current._id, scenario);
        setOrder(result.pedido);
        if (result.pedido.estado === 'pagado') onPaid();
        return;
      }
      const { checkoutUrl, pedido } = await startCheckout(current._id);
      setOrder(pedido);
      const url = safeCheckoutUrl(provider, checkoutUrl);
      if (!url) throw new Error('La URL de pago recibida no pertenece a la pasarela elegida.');
      savePendingCheckout(current._id, provider);
      window.location.assign(url); // el comprador paga en la página de la pasarela
    } catch (e) {
      setError(current ? `${e.message} El pedido quedó guardado en Mis pedidos.` : e.message);
    } finally {
      processing.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={busy ? undefined : onClose}>
      <aside className="cart-panel" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onMouseDown={e => e.stopPropagation()}>
        <div className="cart-title">
          <div>
            <h2 id="checkout-title">Pagar pedido</h2>
            <p>Modo de prueba: no se cobra dinero real.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar" disabled={busy}><X /></button>
        </div>

        <div className="panel-body">
          <ul className="checkout-lines">
            {order
              ? order.items.map(item => (
                <li key={item.producto}>
                  <span>{item.nombre} × {item.cantidad}</span>
                  <b>{soles(item.precioCentimos * item.cantidad)}</b>
                </li>
              ))
              : items.map(({ producto, qty }) => (
                <li key={producto._id}>
                  <span>{producto.nombre} × {qty}</span>
                  <b>{soles(Math.round(producto.precio * 100) * qty)}</b>
                </li>
              ))}
          </ul>
          <div className="total"><span>Total</span><b>{soles(order?.totalCentimos ?? totalCentimos)}</b></div>

          {!order && (
            <fieldset className="pay-options" disabled={busy}>
              <legend>Medio de pago</legend>
              {!config && !error && <p className="inline-note">Cargando medios de pago…</p>}
              {config && ORDER.map(id => {
                const enabled = config.proveedores[id];
                return (
                  <label key={id} className={`pay-option${provider === id ? ' selected' : ''}${enabled ? '' : ' disabled'}`}>
                    <input type="radio" name="provider" value={id} checked={provider === id} disabled={!enabled} onChange={() => setProvider(id)} />
                    <span>
                      <b>{PROVIDERS[id].nombre}</b>
                      <small>{enabled ? PROVIDERS[id].detalle : 'No configurado en backend/.env'}</small>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}

          {!order && inUsd && config && (
            <p className="inline-note">
              {PROVIDERS[provider].nombre} sandbox cobra en dólares: se cobrarán aprox. <b>{usd(estimateUsd(items, config.tipoCambio))}</b> (tipo de cambio de prueba {config.tipoCambio}).
            </p>
          )}

          {!order && provider === 'mock' && (
            <label className="field">
              Resultado a simular
              <select value={scenario} disabled={busy} onChange={e => setScenario(e.target.value)}>
                <option value="aprobado">Pago aprobado</option>
                <option value="rechazado">Pago rechazado</option>
                <option value="timeout">Timeout (queda en revisión)</option>
              </select>
            </label>
          )}

          {order && (
            <div className={`order-status state-${order.estado}`}>
              <b>{STATES[order.estado]}</b>
              {order.mensaje && <p>{order.mensaje}</p>}
              <small>Pedido {order._id}</small>
            </div>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>

        <div className="cart-bottom">
          {!finished && (
            <button className="checkout" disabled={busy || !provider || (order && provider === 'mock')} onClick={pay}>
              {busy ? 'Procesando…' : provider === 'mock' ? 'Confirmar compra simulada' : `Pagar con ${PROVIDERS[provider]?.nombre || '…'}`}
              <ArrowRight size={18} />
            </button>
          )}
          <p><ShieldCheck size={14} /> El monto lo calcula el servidor con los precios del catálogo.</p>
          <div className="panel-actions">
            <button className="ghost-btn" disabled={busy} onClick={onShowOrders}>Mis pedidos</button>
            <button className="ghost-btn" disabled={busy} onClick={onClose}>{finished ? 'Volver a la tienda' : 'Cancelar'}</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
