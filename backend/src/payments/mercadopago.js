import { createHmac, timingSafeEqual } from 'node:crypto';
import { MP_API, isLocalUrl, mercadoPagoWebhook, requestJson, returnUrl } from './config.js';

// Checkout Pro (Preferences API): el backend crea una "preferencia" con los productos del pedido
// y el comprador paga en la página de Mercado Pago. Crear la preferencia NO significa que esté pagado:
// el estado real se consulta después en la API de pagos.

const auth = env => ({ Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` });

async function ensureTestSeller(env, fetcher) {
  // Las credenciales de prueba también pueden empezar con APP_USR-, así que el prefijo no basta:
  // se confirma con la API que la cuenta dueña del token es un usuario de prueba.
  if (!env.MP_ACCESS_TOKEN.startsWith('APP_USR-')) return false;
  const account = await requestJson(fetcher, `${MP_API}/users/me`, { headers: auth(env) }, 'Mercado Pago');
  if (!account.tags?.includes('test_user')) {
    throw new Error('El Access Token no pertenece a una cuenta de prueba. Usa las credenciales de prueba de tu aplicación.');
  }
  return true;
}

export async function createCheckout(order, { env = process.env, fetcher = fetch } = {}) {
  const accountCredentials = await ensureTestSeller(env, fetcher);
  // Mercado Pago no puede redirigir automáticamente a localhost; con una URL pública (MP_BACK_URL_BASE)
  // se activa el regreso automático. En local, el comprador usa "Volver al sitio" o "Verificar pago".
  const base = /^https:\/\//.test(env.MP_BACK_URL_BASE || '') ? env.MP_BACK_URL_BASE.replace(/\/$/, '') : undefined;
  const back = returnUrl(order, 'mercadopago', { env, ...(base ? { base } : {}) });
  const body = {
    items: order.items.map(item => ({
      id: String(item.producto),
      title: item.nombre,
      quantity: item.cantidad,
      unit_price: item.precioCentimos / 100,
      currency_id: 'PEN'
    })),
    external_reference: String(order._id), // une la preferencia y sus pagos con nuestro pedido
    statement_descriptor: 'NOVASHOP',
    back_urls: { success: back, pending: back, failure: back },
    ...(!isLocalUrl(back) ? { auto_return: 'approved' } : {}),
    ...(mercadoPagoWebhook(env) ? { notification_url: mercadoPagoWebhook(env) } : {})
  };
  const send = payload => requestJson(fetcher, `${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: { ...auth(env), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, 'Mercado Pago');

  let preference;
  try { preference = await send(body); }
  catch (error) {
    // Si Mercado Pago rechaza las URLs de retorno locales, se crea la preferencia sin ellas.
    if (error.status !== 400) throw error;
    const { back_urls: _b, auto_return: _a, ...withoutReturn } = body;
    preference = await send(withoutReturn);
  }
  const checkoutUrl = accountCredentials ? preference.init_point : (preference.sandbox_init_point || preference.init_point);
  if (typeof preference.id !== 'string' || !preference.id || typeof checkoutUrl !== 'string' ||
    !/^https:\/\/([a-z0-9-]+\.)*mercadopago\.com(\.pe)?\//i.test(checkoutUrl)) {
    throw new Error('Mercado Pago no devolvió una preferencia de Checkout Pro válida.');
  }
  return { referencia: preference.id, checkoutUrl };
}

export async function getPayment(paymentId, { env = process.env, fetcher = fetch } = {}) {
  if (!/^\d+$/.test(String(paymentId))) throw new Error('Identificador de pago no válido.');
  return requestJson(fetcher, `${MP_API}/v1/payments/${paymentId}`, { headers: auth(env) }, 'Mercado Pago');
}

// Busca los pagos de un pedido por su external_reference. Así se puede verificar
// aunque el comprador no regrese a la tienda (por ejemplo, en localhost).
export async function searchPayments(orderId, { env = process.env, fetcher = fetch } = {}) {
  const query = new URLSearchParams({ external_reference: String(orderId), sort: 'date_created', criteria: 'desc' });
  const data = await requestJson(fetcher, `${MP_API}/v1/payments/search?${query}`, { headers: auth(env) }, 'Mercado Pago');
  return Array.isArray(data.results) ? data.results : [];
}

// Traduce un pago de Mercado Pago al estado del pedido, comprobando que sea de ESTE pedido.
export function paymentResult(payment, order) {
  if (!payment || !/^\d+$/.test(String(payment.id)) ||
    payment.external_reference !== String(order._id) ||
    Math.round(Number(payment.transaction_amount) * 100) !== order.totalCentimos ||
    payment.currency_id !== 'PEN') {
    return { estado: 'revision', mensaje: 'Mercado Pago devolvió datos que no coinciden con el pedido. Revisa el pago antes de continuar.' };
  }
  const cargoId = String(payment.id);
  if (payment.status === 'approved') return { estado: 'pagado', cargoId, mensaje: 'Pago de prueba aprobado por Mercado Pago. No se cobró dinero real.' };
  if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(payment.status)) {
    return { estado: 'rechazado', cargoId, mensaje: `Mercado Pago no aprobó el pago (${payment.status_detail || payment.status}).` };
  }
  return { estado: 'revision', cargoId, mensaje: 'Mercado Pago aún no confirma el pago (pendiente). Vuelve a verificar en unos minutos.' };
}

// Devuelve el nuevo estado del pedido, o null si todavía no existe ningún pago.
export async function checkPayment(order, { paymentId } = {}, deps = {}) {
  if (paymentId) {
    const payment = await getPayment(paymentId, deps);
    // Un payment_id que no corresponde a este pedido se ignora y se busca por referencia.
    if (payment?.external_reference === String(order._id)) return paymentResult(payment, order);
  }
  const payments = await searchPayments(order._id, deps);
  const payment = payments.find(p => p.status === 'approved') || payments[0];
  return payment ? paymentResult(payment, order) : null;
}

// Firma de las notificaciones (webhooks): HMAC-SHA256 de "id:...;request-id:...;ts:...;".
export function verifyWebhookSignature({ dataId, requestId, signature, secret }) {
  if (!dataId || !requestId || !signature || !secret) return false;
  const parts = Object.fromEntries(signature.split(',').map(part => part.trim().split('=')));
  if (!parts.ts || !/^[a-f0-9]{64}$/i.test(parts.v1 || '')) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  const received = Buffer.from(parts.v1, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
