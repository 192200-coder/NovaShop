import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { paymentConfig } from '../src/payments/config.js';
import { calculateOrder, chargeAmount, simulateCharge } from '../src/payments/order.js';
import * as mercadopago from '../src/payments/mercadopago.js';
import * as stripe from '../src/payments/stripe.js';
import * as paypal from '../src/payments/paypal.js';

const productId = 'b'.repeat(24);
const orderId = 'a'.repeat(24);
const catalog = [{ _id: productId, nombre: 'Mouse', precio: 37.5, stock: 3 }];

// fetch simulado: responde según la URL y registra las llamadas.
function fakeFetch(routes) {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    const match = Object.entries(routes).find(([key]) => url.includes(key));
    if (!match) throw new Error(`URL inesperada: ${url}`);
    const value = typeof match[1] === 'function' ? match[1](url, options, calls) : match[1];
    const { status = 200, body = value } = value?.__status ? { status: value.__status, body: value.body } : {};
    return { ok: status < 400, status, json: async () => body };
  };
  return { fetcher, calls };
}

const baseOrder = (extra = {}) => ({
  _id: orderId,
  items: [{ producto: productId, nombre: 'Mouse', cantidad: 2, precioCentimos: 3750 }],
  totalCentimos: 7500,
  ...extra
});

test('configuración: solo acepta claves de prueba', () => {
  const ok = paymentConfig({ MP_ACCESS_TOKEN: 'TEST-123-abc', STRIPE_SECRET_KEY: 'sk_test_abc', PAYPAL_CLIENT_ID: 'a', PAYPAL_CLIENT_SECRET: 'b' });
  assert.deepEqual(ok.proveedores, { mercadopago: true, stripe: true, paypal: true, mock: true });
  const live = paymentConfig({ STRIPE_SECRET_KEY: 'sk_live_abc', NODE_ENV: 'production' });
  assert.equal(live.proveedores.stripe, false);
  assert.equal(live.proveedores.mock, false);
  assert.equal(live.proveedores.mercadopago, false);
  assert.equal(paymentConfig({ TIPO_CAMBIO_PEN_USD: 'x' }).tipoCambio, 3.75);
});

test('el total se calcula con los precios del servidor', () => {
  const order = calculateOrder([{ producto: productId, cantidad: 2 }], catalog);
  assert.equal(order.totalCentimos, 7500);
  assert.deepEqual(order.items[0], { producto: productId, nombre: 'Mouse', cantidad: 2, precioCentimos: 3750 });
  assert.throws(() => calculateOrder([{ producto: productId, cantidad: 4 }], catalog), /stock/);
  assert.throws(() => calculateOrder([{ producto: productId, cantidad: 1.5 }], catalog), /cantidades/);
  assert.throws(() => calculateOrder([{ producto: productId, cantidad: 1 }, { producto: productId, cantidad: 1 }], catalog), /cantidades/);
  assert.throws(() => calculateOrder([], catalog), /entre 1 y 50/);
});

test('monto de cobro: soles para Mercado Pago y dólares para Stripe/PayPal', () => {
  const order = calculateOrder([{ producto: productId, cantidad: 2 }], catalog);
  assert.deepEqual(chargeAmount(order, 'mercadopago', 3.75), { moneda: 'PEN', centavos: 7500 });
  assert.deepEqual(chargeAmount(order, 'stripe', 3.75), { moneda: 'USD', centavos: 2000, tipoCambio: 3.75 });
  assert.throws(() => chargeAmount({ items: [{ precioCentimos: 100, cantidad: 1 }] }, 'paypal', 3.75), /mínimo/);
});

test('simulador: escenarios válidos', () => {
  assert.equal(simulateCharge('aprobado').estado, 'pagado');
  assert.equal(simulateCharge('rechazado').estado, 'rechazado');
  assert.equal(simulateCharge('timeout').estado, 'revision');
  assert.throws(() => simulateCharge('otro'));
});

test('Mercado Pago: crea la preferencia con external_reference y back_urls', async () => {
  const { fetcher, calls } = fakeFetch({
    '/checkout/preferences': { id: 'pref-1', init_point: 'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=pref-1', sandbox_init_point: 'https://sandbox.mercadopago.com.pe/checkout/v1/redirect?pref_id=pref-1' }
  });
  const env = { MP_ACCESS_TOKEN: 'TEST-abc', CLIENT_ORIGIN: 'https://localhost:5173' };
  const result = await mercadopago.createCheckout(baseOrder(), { env, fetcher });
  assert.equal(result.referencia, 'pref-1');
  assert.match(result.checkoutUrl, /^https:\/\/sandbox\.mercadopago/);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.external_reference, orderId);
  assert.equal(body.items[0].unit_price, 37.5);
  assert.equal(body.items[0].currency_id, 'PEN');
  assert.match(body.back_urls.success, /checkout=mercadopago&pedido=a{24}/);
  assert.equal(body.auto_return, undefined, 'localhost no admite regreso automático');
});

test('ngrok: se acepta como origen y Mercado Pago activa el regreso automático', async () => {
  const { allowedOrigins, originFor } = await import('../src/payments/config.js');
  const env = { CLIENT_ORIGIN: 'https://localhost:5173', MP_BACK_URL_BASE: 'https://demo.ngrok-free.app/', MP_ACCESS_TOKEN: 'TEST-abc' };
  assert.deepEqual(allowedOrigins(env), ['https://localhost:5173', 'https://demo.ngrok-free.app']);
  assert.equal(originFor({ get: () => 'https://evil.example' }, env), 'https://localhost:5173');
  const { fetcher, calls } = fakeFetch({ '/checkout/preferences': { id: 'p', sandbox_init_point: 'https://sandbox.mercadopago.com.pe/x' } });
  await mercadopago.createCheckout(baseOrder(), { env, fetcher, origin: 'https://localhost:5173' });
  const body = JSON.parse(calls[0].options.body);
  assert.match(body.back_urls.success, /^https:\/\/demo\.ngrok-free\.app\/\?checkout=mercadopago/);
  assert.equal(body.auto_return, 'approved');
  const stripeFetch = fakeFetch({ '/checkout/sessions': { id: 'cs', url: 'https://checkout.stripe.com/c/x' } });
  await stripe.createCheckout(baseOrder({ cobro: { centavos: 2000, tipoCambio: 3.75 } }), { env: { STRIPE_SECRET_KEY: 'sk_test_x' }, fetcher: stripeFetch.fetcher, origin: 'https://demo.ngrok-free.app' });
  assert.match(new URLSearchParams(stripeFetch.calls[0].options.body.toString()).get('success_url'), /^https:\/\/demo\.ngrok-free\.app\//);
});

test('Mercado Pago: si rechaza las URLs locales, reintenta sin back_urls', async () => {
  const { fetcher, calls } = fakeFetch({
    '/checkout/preferences': (_url, options) => JSON.parse(options.body).back_urls
      ? { __status: 400, body: { message: 'invalid back_urls' } }
      : { id: 'pref-2', sandbox_init_point: 'https://sandbox.mercadopago.com.pe/checkout?pref_id=pref-2' }
  });
  const result = await mercadopago.createCheckout(baseOrder(), { env: { MP_ACCESS_TOKEN: 'TEST-abc' }, fetcher });
  assert.equal(result.referencia, 'pref-2');
  assert.equal(calls.length, 2);
});

test('Mercado Pago: un token APP_USR debe pertenecer a un usuario de prueba', async () => {
  const { fetcher } = fakeFetch({ '/users/me': { id: 1, tags: ['normal'] } });
  await assert.rejects(mercadopago.createCheckout(baseOrder(), { env: { MP_ACCESS_TOKEN: 'APP_USR-abc' }, fetcher }), /cuenta de prueba/);
});

test('Mercado Pago: verifica buscando por referencia y compara el importe', async () => {
  const approved = { id: 99, status: 'approved', transaction_amount: 75, currency_id: 'PEN', external_reference: orderId };
  const { fetcher } = fakeFetch({ '/v1/payments/search': { results: [{ ...approved, id: 98, status: 'rejected' }, approved] } });
  const env = { MP_ACCESS_TOKEN: 'TEST-abc' };
  assert.deepEqual((await mercadopago.checkPayment(baseOrder(), {}, { env, fetcher })).estado, 'pagado');

  const none = fakeFetch({ '/v1/payments/search': { results: [] } });
  assert.equal(await mercadopago.checkPayment(baseOrder(), {}, { env, fetcher: none.fetcher }), null);

  assert.equal(mercadopago.paymentResult({ ...approved, transaction_amount: 1 }, baseOrder()).estado, 'revision');
  assert.equal(mercadopago.paymentResult({ ...approved, status: 'in_process' }, baseOrder()).estado, 'revision');
  assert.equal(mercadopago.paymentResult({ ...approved, status: 'rejected' }, baseOrder()).estado, 'rechazado');
});

test('Mercado Pago: un payment_id de otro pedido se ignora', async () => {
  const { fetcher, calls } = fakeFetch({
    '/v1/payments/search': { results: [] },
    '/v1/payments/55': { id: 55, status: 'approved', transaction_amount: 75, currency_id: 'PEN', external_reference: 'c'.repeat(24) }
  });
  assert.equal(await mercadopago.checkPayment(baseOrder(), { paymentId: '55' }, { env: { MP_ACCESS_TOKEN: 'TEST-abc' }, fetcher }), null);
  assert.equal(calls.length, 2);
});

test('Mercado Pago: firma del webhook', () => {
  const secret = 'clave';
  const v1 = createHmac('sha256', secret).update('id:123;request-id:req-1;ts:1700;').digest('hex');
  assert.equal(mercadopago.verifyWebhookSignature({ dataId: '123', requestId: 'req-1', signature: `ts=1700,v1=${v1}`, secret }), true);
  assert.equal(mercadopago.verifyWebhookSignature({ dataId: '124', requestId: 'req-1', signature: `ts=1700,v1=${v1}`, secret }), false);
  assert.equal(mercadopago.verifyWebhookSignature({ dataId: '123', requestId: 'req-1', signature: 'ts=1700,v1=zz', secret }), false);
});

test('Stripe: crea la sesión en USD con idempotencia', async () => {
  const { fetcher, calls } = fakeFetch({ '/checkout/sessions': { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' } });
  const order = baseOrder({ cobro: { moneda: 'USD', centavos: 2000, tipoCambio: 3.75 } });
  const result = await stripe.createCheckout(order, { env: { STRIPE_SECRET_KEY: 'sk_test_x', CLIENT_ORIGIN: 'https://localhost:5173' }, fetcher });
  assert.deepEqual(result, { referencia: 'cs_test_1', checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  const form = new URLSearchParams(calls[0].options.body.toString());
  assert.equal(form.get('line_items[0][price_data][unit_amount]'), '1000');
  assert.equal(form.get('line_items[0][price_data][currency]'), 'usd');
  assert.equal(form.get('line_items[0][quantity]'), '2');
  assert.equal(form.get('client_reference_id'), orderId);
  assert.equal(calls[0].options.headers['Idempotency-Key'], `novashop-pedido-${orderId}`);
});

test('Stripe: resultado de la sesión', () => {
  const order = baseOrder({ referenciaExterna: 'cs_1', cobro: { moneda: 'USD', centavos: 2000 } });
  const session = { id: 'cs_1', client_reference_id: orderId, currency: 'usd', amount_total: 2000, payment_status: 'paid', payment_intent: 'pi_1' };
  assert.deepEqual(stripe.sessionResult(session, order), { estado: 'pagado', cargoId: 'pi_1', mensaje: 'Pago de prueba aprobado por Stripe. No se cobró dinero real.' });
  assert.equal(stripe.sessionResult({ ...session, payment_status: 'unpaid', status: 'open' }, order), null);
  assert.equal(stripe.sessionResult({ ...session, payment_status: 'unpaid', status: 'expired' }, order).estado, 'rechazado');
  assert.equal(stripe.sessionResult({ ...session, amount_total: 1 }, order).estado, 'revision');
});

test('PayPal: crea la orden y captura al verificar', async () => {
  paypal.resetTokenCache();
  let status = 'APPROVED';
  const captured = {
    id: 'PP-1', status: 'COMPLETED',
    purchase_units: [{ reference_id: orderId, payments: { captures: [{ id: 'CAP-1', status: 'COMPLETED', custom_id: orderId, amount: { currency_code: 'USD', value: '20.00' } }] } }]
  };
  const { fetcher, calls } = fakeFetch({
    '/v1/oauth2/token': { access_token: 'tok', expires_in: 3600 },
    '/capture': () => { status = 'COMPLETED'; return captured; },
    '/v2/checkout/orders/PP-1': () => status === 'APPROVED' ? { id: 'PP-1', status, purchase_units: [{ custom_id: orderId }] } : captured,
    '/v2/checkout/orders': { id: 'PP-1', status: 'PAYER_ACTION_REQUIRED', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=PP-1' }] }
  });
  const env = { PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'secret', CLIENT_ORIGIN: 'https://localhost:5173' };
  const order = baseOrder({ cobro: { moneda: 'USD', centavos: 2000, tipoCambio: 3.75 } });
  const checkout = await paypal.createCheckout(order, { env, fetcher });
  assert.equal(checkout.referencia, 'PP-1');
  const created = JSON.parse(calls.find(c => c.url.endsWith('/v2/checkout/orders')).options.body);
  assert.equal(created.purchase_units[0].amount.value, '20.00');
  assert.equal(created.purchase_units[0].amount.currency_code, 'USD');

  const result = await paypal.checkPayment({ ...order, referenciaExterna: 'PP-1' }, {}, { env, fetcher });
  assert.deepEqual(result, { estado: 'pagado', cargoId: 'CAP-1', mensaje: 'Pago de prueba aprobado por PayPal. No se cobró dinero real.' });
  assert.equal(calls.filter(c => c.url.includes('/v1/oauth2/token')).length, 1, 'el token se reutiliza');
});

test('PayPal: una orden sin aprobar sigue pendiente y montos distintos van a revisión', () => {
  const order = baseOrder({ referenciaExterna: 'PP-2', cobro: { moneda: 'USD', centavos: 2000 } });
  assert.equal(paypal.captureResult({ id: 'PP-2', status: 'PAYER_ACTION_REQUIRED', purchase_units: [{}] }, order), null);
  const wrong = { id: 'PP-2', purchase_units: [{ payments: { captures: [{ id: 'C', status: 'COMPLETED', amount: { currency_code: 'USD', value: '1.00' } }] } }] };
  assert.equal(paypal.captureResult(wrong, order).estado, 'revision');
});
