import { STRIPE_API, requestJson, returnUrl } from './config.js';
import { usdUnitCents } from './order.js';

// Stripe Checkout: página de pago alojada por Stripe. Se usa la API REST directamente
// (sin la librería "stripe") con la clave secreta de prueba sk_test_ del backend.

// Stripe recibe formularios con claves anidadas: line_items[0][price_data][currency]=usd
function toForm(value, prefix = '', form = new URLSearchParams()) {
  if (Array.isArray(value)) value.forEach((item, i) => toForm(item, `${prefix}[${i}]`, form));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) toForm(item, prefix ? `${prefix}[${key}]` : key, form);
  } else if (value !== undefined) form.append(prefix, String(value));
  return form;
}

const headers = env => ({
  Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
  'Content-Type': 'application/x-www-form-urlencoded'
});

export async function createCheckout(order, { env = process.env, fetcher = fetch, origin } = {}) {
  const base = origin || undefined;
  const tipoCambio = order.cobro.tipoCambio;
  const session = await requestJson(fetcher, `${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    // La misma clave para el mismo pedido evita crear dos sesiones si se repite la solicitud.
    headers: { ...headers(env), 'Idempotency-Key': `novashop-pedido-${order._id}` },
    body: toForm({
      mode: 'payment',
      client_reference_id: String(order._id),
      metadata: { pedido: String(order._id) },
      line_items: order.items.map(item => ({
        quantity: item.cantidad,
        price_data: {
          currency: 'usd',
          unit_amount: usdUnitCents(item.precioCentimos, tipoCambio),
          product_data: { name: item.nombre }
        }
      })),
      success_url: returnUrl(order, 'stripe', { env, base }),
      cancel_url: returnUrl(order, 'stripe', { env, base, extra: { cancelado: '1' } })
    })
  }, 'Stripe');
  if (typeof session.id !== 'string' || typeof session.url !== 'string' || !/^https:\/\/checkout\.stripe\.com\//.test(session.url)) {
    throw new Error('Stripe no devolvió una sesión de Checkout válida.');
  }
  return { referencia: session.id, checkoutUrl: session.url };
}

export function sessionResult(session, order) {
  if (!session || session.id !== order.referenciaExterna || session.client_reference_id !== String(order._id) ||
    session.currency !== 'usd' || session.amount_total !== order.cobro.centavos) {
    return { estado: 'revision', mensaje: 'Stripe devolvió datos que no coinciden con el pedido.' };
  }
  const cargoId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (session.payment_status === 'paid') return { estado: 'pagado', cargoId, mensaje: 'Pago de prueba aprobado por Stripe. No se cobró dinero real.' };
  if (session.status === 'expired') return { estado: 'rechazado', mensaje: 'La sesión de pago de Stripe expiró sin completarse.' };
  return null; // aún no se paga (el comprador no terminó el checkout)
}

export async function checkPayment(order, _input, { env = process.env, fetcher = fetch } = {}) {
  const session = await requestJson(fetcher, `${STRIPE_API}/checkout/sessions/${encodeURIComponent(order.referenciaExterna)}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }
  }, 'Stripe');
  return sessionResult(session, order);
}
