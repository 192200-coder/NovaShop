import { PAYPAL_API, requestJson, returnUrl } from './config.js';
import { formatAmount } from './order.js';

// PayPal Orders v2 (sandbox): 1) se crea la orden, 2) el comprador la aprueba en PayPal,
// 3) al volver, el backend la "captura" (ahí recién se cobra) y comprueba el resultado.

let cachedToken = null;
let tokenExpires = 0;

async function accessToken(env, fetcher) {
  if (cachedToken && Date.now() < tokenExpires) return cachedToken;
  const credentials = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const data = await requestJson(fetcher, `${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  }, 'PayPal');
  cachedToken = data.access_token;
  tokenExpires = Date.now() + Math.max(0, (Number(data.expires_in) || 0) - 60) * 1000;
  return cachedToken;
}

export function resetTokenCache() { cachedToken = null; tokenExpires = 0; }

async function paypal(path, { method = 'GET', body, requestId } = {}, { env = process.env, fetcher = fetch } = {}) {
  const token = await accessToken(env, fetcher);
  return requestJson(fetcher, `${PAYPAL_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) // idempotencia
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  }, 'PayPal');
}

export async function createCheckout(order, deps = {}) {
  const env = deps.env || process.env;
  const result = await paypal('/v2/checkout/orders', {
    method: 'POST',
    requestId: `novashop-pedido-${order._id}`,
    body: {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: String(order._id),
        custom_id: String(order._id),
        description: `NovaShop: ${order.items.length} producto(s)`.slice(0, 127),
        amount: { currency_code: 'USD', value: formatAmount(order.cobro.centavos) }
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'NovaShop',
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
            return_url: returnUrl(order, 'paypal', { env }),
            cancel_url: returnUrl(order, 'paypal', { env, extra: { cancelado: '1' } })
          }
        }
      }
    }
  }, deps);
  const link = result.links?.find(l => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  if (typeof result.id !== 'string' || typeof link !== 'string' || !/^https:\/\/(www\.)?sandbox\.paypal\.com\//.test(link)) {
    throw new Error('PayPal no devolvió una orden sandbox válida.');
  }
  return { referencia: result.id, checkoutUrl: link };
}

export function captureResult(paypalOrder, order) {
  const unit = paypalOrder?.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const customId = capture?.custom_id || unit?.custom_id;
  if (!paypalOrder || paypalOrder.id !== order.referenciaExterna || (customId && customId !== String(order._id))) {
    return { estado: 'revision', mensaje: 'PayPal devolvió datos que no coinciden con el pedido.' };
  }
  if (!capture) {
    if (paypalOrder.status === 'VOIDED') return { estado: 'rechazado', mensaje: 'La orden de PayPal fue anulada.' };
    return null; // el comprador aún no aprueba el pago
  }
  if (capture.amount?.currency_code !== 'USD' || Math.round(Number(capture.amount?.value) * 100) !== order.cobro.centavos) {
    return { estado: 'revision', cargoId: capture.id, mensaje: 'El monto capturado por PayPal no coincide con el pedido.' };
  }
  if (capture.status === 'COMPLETED') return { estado: 'pagado', cargoId: capture.id, mensaje: 'Pago de prueba aprobado por PayPal. No se cobró dinero real.' };
  if (['DECLINED', 'FAILED'].includes(capture.status)) return { estado: 'rechazado', cargoId: capture.id, mensaje: 'PayPal rechazó el pago.' };
  return { estado: 'revision', cargoId: capture.id, mensaje: `PayPal aún no confirma el pago (${capture.status}).` };
}

export async function checkPayment(order, _input, deps = {}) {
  const id = encodeURIComponent(order.referenciaExterna);
  let paypalOrder = await paypal(`/v2/checkout/orders/${id}`, {}, deps);
  if (paypalOrder.status === 'APPROVED') {
    // El comprador aprobó: se captura una sola vez (PayPal-Request-Id evita cobros duplicados).
    try {
      paypalOrder = await paypal(`/v2/checkout/orders/${id}/capture`, { method: 'POST', requestId: `novashop-captura-${order._id}` }, deps);
    } catch (error) {
      if (error.data?.details?.[0]?.issue === 'INSTRUMENT_DECLINED') {
        return { estado: 'rechazado', mensaje: 'PayPal rechazó el medio de pago. Crea un pedido nuevo para intentarlo otra vez.' };
      }
      if (error.data?.details?.[0]?.issue !== 'ORDER_ALREADY_CAPTURED') throw error;
      paypalOrder = await paypal(`/v2/checkout/orders/${id}`, {}, deps);
    }
  }
  return captureResult(paypalOrder, order);
}
