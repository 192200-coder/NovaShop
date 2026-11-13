import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHmac } from 'node:crypto';
import { createPaymentsRouter } from '../src/routes/payments.js';

const productId = 'b'.repeat(24);
const ANA = 'a1'.repeat(12);
const MIGUEL = 'a2'.repeat(12);

// "MongoDB" en memoria con las operaciones que usa el router.
function memoryOrders() {
  const docs = [];
  let next = 1;
  const matches = (doc, filter) => Object.entries(filter).every(([key, value]) => {
    if (value?.$in) return value.$in.includes(doc[key]);
    if (value?.$exists === false) return doc[key] === undefined;
    return String(doc[key]) === String(value);
  });
  const copy = doc => doc && structuredClone(doc);
  return {
    docs,
    create: async value => { const doc = { ...value, _id: String(next++).padStart(24, '0'), estado: 'pendiente', createdAt: new Date() }; docs.push(doc); return copy(doc); },
    findOne: async filter => copy(docs.find(d => matches(d, filter))),
    findById: async id => copy(docs.find(d => d._id === String(id))),
    findOneAndUpdate: async (filter, update) => {
      const doc = docs.find(d => matches(d, filter));
      if (!doc) return null;
      Object.assign(doc, update.$set);
      return copy(doc);
    },
    updateOne: async (filter, update) => { const doc = docs.find(d => matches(d, filter)); if (doc) Object.assign(doc, update.$set); },
    find: filter => ({ sort: () => ({ limit: () => ({ lean: async () => docs.filter(d => matches(d, filter)).map(copy).reverse() }) }) })
  };
}

async function fixture(run, { proveedores = {}, gateways = {}, webhookSecret = 'secreto' } = {}) {
  const orders = memoryOrders();
  const calls = { createCheckout: 0, checkPayment: 0 };
  const defaultGateway = {
    createCheckout: async order => {
      calls.createCheckout++;
      await new Promise(resolve => setTimeout(resolve, 20));
      return { referencia: `ref-${order._id}`, checkoutUrl: 'https://sandbox.mercadopago.com.pe/checkout/test' };
    },
    checkPayment: async () => { calls.checkPayment++; return { estado: 'pagado', cargoId: '777', mensaje: 'ok' }; },
    getPayment: async id => ({ id: Number(id), status: 'approved', external_reference: orders.docs[0]?._id, transaction_amount: 40, currency_id: 'PEN' }),
    paymentResult: () => ({ estado: 'pagado', cargoId: '888', mensaje: 'webhook' }),
    verifyWebhookSignature: ({ signature }) => signature === 'valida'
  };
  const app = express();
  app.use(express.json());
  app.use('/pagos', createPaymentsRouter({
    orders,
    products: { find: () => ({ lean: async () => [{ _id: productId, nombre: 'Mouse', precio: 20, stock: 5 }] }) },
    authenticate: (req, res, next) => {
      if (!req.get('x-user')) return res.status(401).json({ error: 'Inicia sesión' });
      req.user = { _id: req.get('x-user') };
      next();
    },
    configuration: () => ({ proveedores: { mercadopago: true, stripe: true, paypal: true, mock: true, ...proveedores }, tipoCambio: 4 }),
    gateways: { mercadopago: { ...defaultGateway, ...gateways }, stripe: { ...defaultGateway, ...gateways }, paypal: { ...defaultGateway, ...gateways } },
    webhookSecret: () => webhookSecret
  }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/pagos`;
  const call = (path, { user = ANA, body, method = body ? 'POST' : 'GET', headers = {} } = {}) => fetch(`${base}${path}`, {
    method,
    headers: { ...(user ? { 'x-user': user } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
  try { await run({ call, orders, calls }); }
  finally { server.close(); }
}

const cart = [{ producto: productId, cantidad: 2 }];

test('config no expone claves', () => fixture(async ({ call }) => {
  const { status, body } = await call('/config', { user: null });
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(body).sort(), ['modo', 'proveedores', 'tipoCambio']);
}));

test('sin sesión no se pueden crear pedidos', () => fixture(async ({ call }) => {
  assert.equal((await call('/pedidos', { user: null, body: { items: cart, proveedor: 'mercadopago' } })).status, 401);
}));

test('crear pedido: total del servidor y cobro según la pasarela', () => fixture(async ({ call }) => {
  const mp = await call('/pedidos', { body: { items: cart, proveedor: 'mercadopago' } });
  assert.equal(mp.status, 201);
  assert.equal(mp.body.totalCentimos, 4000);
  assert.deepEqual(mp.body.cobro, { moneda: 'PEN', centavos: 4000 });
  const st = await call('/pedidos', { body: { items: cart, proveedor: 'stripe' } });
  assert.deepEqual(st.body.cobro, { moneda: 'USD', centavos: 1000, tipoCambio: 4 });
  assert.equal((await call('/pedidos', { body: { items: cart, proveedor: 'bitcoin' } })).status, 400);
  assert.equal((await call('/pedidos', { body: { items: [{ producto: productId, cantidad: 99 }], proveedor: 'mock' } })).status, 400);
}));

test('pasarela sin configurar responde 503', () => fixture(async ({ call }) => {
  assert.equal((await call('/pedidos', { body: { items: cart, proveedor: 'paypal' } })).status, 503);
}, { proveedores: { paypal: false } }));

test('checkout: dos clics simultáneos crean un solo checkout', () => fixture(async ({ call, calls, orders }) => {
  const { body: order } = await call('/pedidos', { body: { items: cart, proveedor: 'mercadopago' } });
  const [a, b] = await Promise.all([call(`/pedidos/${order._id}/checkout`, { body: {} }), call(`/pedidos/${order._id}/checkout`, { body: {} })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(calls.createCheckout, 1);
  assert.equal(orders.docs[0].referenciaExterna, `ref-${order._id}`);
  const again = await call(`/pedidos/${order._id}/checkout`, { body: {} });
  assert.equal(again.body.reutilizada, true);
  assert.equal(calls.createCheckout, 1);
}));

test('checkout: si la pasarela falla, el pedido vuelve a pendiente y se puede reintentar', () => {
  let fail = true;
  return fixture(async ({ call, orders }) => {
    const { body: order } = await call('/pedidos', { body: { items: cart, proveedor: 'stripe' } });
    assert.equal((await call(`/pedidos/${order._id}/checkout`, { body: {} })).status, 502);
    assert.equal(orders.docs[0].estado, 'pendiente');
    fail = false;
    assert.equal((await call(`/pedidos/${order._id}/checkout`, { body: {} })).status, 200);
  }, { gateways: { createCheckout: async o => { if (fail) throw new Error('caída'); return { referencia: 'cs_1', checkoutUrl: 'https://checkout.stripe.com/x' }; } } });
});

test('verificar: actualiza el estado y no vuelve a consultar un pedido pagado', () => fixture(async ({ call, calls }) => {
  const { body: order } = await call('/pedidos', { body: { items: cart, proveedor: 'paypal' } });
  assert.equal((await call(`/pedidos/${order._id}/verificar`, { body: {} })).status, 409, 'sin checkout no hay nada que verificar');
  await call(`/pedidos/${order._id}/checkout`, { body: {} });
  const result = await call(`/pedidos/${order._id}/verificar`, { body: {} });
  assert.equal(result.body.pedido.estado, 'pagado');
  assert.equal(result.body.pedido.cargoId, '777');
  await call(`/pedidos/${order._id}/verificar`, { body: {} });
  assert.equal(calls.checkPayment, 1);
  assert.equal((await call(`/pedidos/${order._id}/verificar`, { body: { payment_id: 'abc' } })).status, 400);
}));

test('verificar: sin pago todavía, el pedido sigue pendiente', () => fixture(async ({ call }) => {
  const { body: order } = await call('/pedidos', { body: { items: cart, proveedor: 'mercadopago' } });
  await call(`/pedidos/${order._id}/checkout`, { body: {} });
  const result = await call(`/pedidos/${order._id}/verificar`, { body: {} });
  assert.equal(result.body.sinPago, true);
  assert.equal(result.body.pedido.estado, 'pendiente');
}, { gateways: { checkPayment: async () => null } }));

test('un usuario no ve ni paga pedidos de otro', () => fixture(async ({ call }) => {
  const { body: order } = await call('/pedidos', { body: { items: cart, proveedor: 'mock' } });
  assert.equal((await call(`/pedidos/${order._id}`, { user: MIGUEL })).status, 404);
  assert.equal((await call(`/pedidos/${order._id}/pagar`, { user: MIGUEL, body: { escenario: 'aprobado' } })).status, 404);
  assert.equal((await call('/pedidos', { user: MIGUEL })).body.length, 0);
  assert.equal((await call('/pedidos')).body.length, 1);
}));

test('simulador: aprueba una sola vez', () => fixture(async ({ call }) => {
  const { body: order } = await call('/pedidos', { body: { items: cart, proveedor: 'mock' } });
  assert.equal((await call(`/pedidos/${order._id}/pagar`, { body: { escenario: 'x' } })).status, 400);
  const paid = await call(`/pedidos/${order._id}/pagar`, { body: { escenario: 'aprobado' } });
  assert.equal(paid.body.pedido.estado, 'pagado');
  const again = await call(`/pedidos/${order._id}/pagar`, { body: { escenario: 'rechazado' } });
  assert.equal(again.body.pedido.estado, 'pagado');
  assert.equal((await call(`/pedidos/${order._id}/checkout`, { body: {} })).status, 409);
}));

test('webhook: exige firma y consulta el pago', () => fixture(async ({ call, orders }) => {
  const { body: order } = await call('/pedidos', { body: { items: cart, proveedor: 'mercadopago' } });
  assert.equal((await call('/webhook?data.id=123', { user: null, body: {}, headers: { 'x-signature': 'falsa', 'x-request-id': 'r' } })).status, 401);
  const ok = await call('/webhook?data.id=123', { user: null, body: {}, headers: { 'x-signature': 'valida', 'x-request-id': 'r' } });
  assert.equal(ok.status, 200);
  assert.equal(orders.docs.find(d => d._id === order._id).estado, 'pagado');
}));

test('webhook: ignora avisos IPN y pagos inexistentes de la simulación', () => fixture(async ({ call }) => {
  assert.equal((await call('/webhook?topic=merchant_order&id=1', { user: null, body: {} })).status, 200);
  const sim = await call('/webhook?data.id=123&type=payment', { user: null, body: {}, headers: { 'x-signature': 'valida', 'x-request-id': 'r' } });
  assert.equal(sim.status, 200);
}, { gateways: { getPayment: async () => { const e = new Error('no existe'); e.status = 404; throw e; } } }));

test('webhook sin clave configurada responde 503', () => fixture(async ({ call }) => {
  assert.equal((await call('/webhook?data.id=1', { user: null, body: {} })).status, 503);
}, { webhookSecret: '' }));

test('verificación de firma real con HMAC', async () => {
  const { verifyWebhookSignature } = await import('../src/payments/mercadopago.js');
  const v1 = createHmac('sha256', 's').update('id:1;request-id:r;ts:2;').digest('hex');
  assert.ok(verifyWebhookSignature({ dataId: '1', requestId: 'r', signature: `ts=2,v1=${v1}`, secret: 's' }));
});
