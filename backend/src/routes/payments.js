import { Router } from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { requireUser, sameOrigin } from './auth.js';
import { NOMBRES, originFor, paymentConfig } from '../payments/config.js';
import { PaymentError, calculateOrder, chargeAmount, simulateCharge } from '../payments/order.js';
import * as mercadopago from '../payments/mercadopago.js';
import * as stripe from '../payments/stripe.js';
import * as paypal from '../payments/paypal.js';

const PROVIDERS = ['mercadopago', 'stripe', 'paypal', 'mock'];
// Estados en los que el pedido todavía puede cambiar según lo que diga la pasarela.
const ACTIVE = ['pendiente', 'procesando', 'revision'];

export function createPaymentsRouter({
  orders = Order,
  products = Product,
  authenticate = requireUser,
  configuration = () => paymentConfig(),
  gateways = { mercadopago, stripe, paypal },
  webhookSecret = () => process.env.MP_WEBHOOK_SECRET
} = {}) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  // Qué pasarelas están listas. Nunca devuelve claves.
  router.get('/config', (_req, res) => {
    const config = configuration();
    res.json({ proveedores: config.proveedores, tipoCambio: config.tipoCambio, modo: 'test' });
  });

  // Notificación de Mercado Pago (opcional): requiere URL pública HTTPS y la clave secreta del webhook.
  router.post('/webhook', async (req, res, next) => {
    try {
      const secret = webhookSecret();
      if (!secret) return res.status(503).json({ error: 'La notificación de pagos no está configurada.' });
      // Avisos en formato antiguo (IPN, ?topic=...) o de otros eventos: se confirman sin procesarlos.
      const type = req.query.type || req.body?.type;
      if (req.query.topic || (type && type !== 'payment')) return res.json({ recibido: true, ignorado: true });
      const dataId = req.query['data.id'] || req.body?.data?.id;
      if (!/^\d+$/.test(String(dataId || '')) || !gateways.mercadopago.verifyWebhookSignature({
        dataId, requestId: req.get('x-request-id'), signature: req.get('x-signature'), secret
      })) {
        return res.status(401).json({ error: 'Firma de notificación no válida.' });
      }
      // No se confía en el contenido del aviso: se consulta el pago directamente a Mercado Pago.
      let payment;
      try { payment = await gateways.mercadopago.getPayment(String(dataId)); }
      catch (error) {
        // La simulación del panel usa IDs que no existen: se responde 200 para que no se reintente.
        if (error.status === 404) return res.json({ recibido: true });
        throw error;
      }
      const reference = payment?.external_reference;
      if (String(payment?.id) !== String(dataId) || !mongoose.isValidObjectId(reference)) return res.json({ recibido: true });
      const order = await orders.findOne({ _id: reference, proveedor: 'mercadopago' });
      if (order) {
        await orders.updateOne({ _id: order._id, estado: { $in: ACTIVE } }, { $set: gateways.mercadopago.paymentResult(payment, order) });
      }
      res.json({ recibido: true });
    } catch (error) { next(error); }
  });

  // ---- Desde aquí, todas las rutas exigen sesión ----
  router.use(authenticate);

  async function loadOrder(req, res, next) {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Pedido no válido.' });
      const order = await orders.findOne({ _id: req.params.id, usuario: req.user._id });
      if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
      req.order = order;
      next();
    } catch (error) { next(error); }
  }

  router.get('/pedidos', async (req, res, next) => {
    try { res.json(await orders.find({ usuario: req.user._id }).sort({ createdAt: -1 }).limit(30).lean()); }
    catch (error) { next(error); }
  });

  router.get('/pedidos/:id', loadOrder, (req, res) => res.json(req.order));

  // 1) Crear el pedido: el servidor consulta precios y stock en MongoDB.
  router.post('/pedidos', sameOrigin, async (req, res, next) => {
    try {
      const config = configuration();
      const proveedor = req.body?.proveedor;
      if (!PROVIDERS.includes(proveedor)) return res.status(400).json({ error: 'Elige un medio de pago válido.' });
      if (!config.proveedores[proveedor]) {
        return res.status(503).json({ error: `${NOMBRES[proveedor]} no está configurado en el servidor. Revisa backend/.env.` });
      }
      const items = req.body?.items;
      if (!Array.isArray(items) || !items.length || items.length > 50 ||
        items.some(item => !item || typeof item.producto !== 'string' || !/^[a-f0-9]{24}$/i.test(item.producto))) {
        return res.status(400).json({ error: 'Carrito no válido.' });
      }
      const catalog = await products.find({ _id: { $in: items.map(item => item.producto) } }).lean();
      let snapshot, cobro;
      try {
        snapshot = calculateOrder(items, catalog);
        cobro = chargeAmount(snapshot, proveedor, config.tipoCambio);
      } catch (error) {
        if (error instanceof PaymentError) return res.status(400).json({ error: error.message });
        throw error;
      }
      res.status(201).json(await orders.create({ usuario: req.user._id, proveedor, ...snapshot, cobro }));
    } catch (error) { next(error); }
  });

  // 2) Preparar el checkout de la pasarela y devolver la URL a la que se redirige al comprador.
  router.post('/pedidos/:id/checkout', sameOrigin, loadOrder, async (req, res, next) => {
    try {
      const order = req.order;
      const gateway = gateways[order.proveedor];
      if (!gateway) return res.status(409).json({ error: 'Este pedido usa el simulador: confírmalo desde la tienda.' });
      if (!configuration().proveedores[order.proveedor]) {
        return res.status(503).json({ error: `${NOMBRES[order.proveedor]} no está configurado en el servidor.` });
      }
      if (order.estado === 'pendiente' && order.checkoutUrl) {
        return res.json({ pedido: order, checkoutUrl: order.checkoutUrl, reutilizada: true });
      }
      if (order.estado !== 'pendiente') {
        return res.status(409).json({ pedido: order, error: 'Este pedido ya tiene un intento de pago. Consulta su estado.' });
      }
      // Reserva atómica: si llegan dos clics a la vez, solo uno crea el checkout.
      const claimed = await orders.findOneAndUpdate(
        { _id: order._id, usuario: req.user._id, estado: 'pendiente', checkoutUrl: { $exists: false } },
        { $set: { estado: 'procesando' } },
        { new: true }
      );
      if (!claimed) return res.status(409).json({ error: 'El pedido ya se está preparando. Actualiza Mis pedidos.' });

      let checkout;
      try {
        checkout = await gateway.createCheckout(claimed, { origin: originFor(req) });
        if (typeof checkout?.referencia !== 'string' || typeof checkout?.checkoutUrl !== 'string') throw new Error('Respuesta incompleta.');
      } catch (error) {
        // Crear un checkout no cobra nada, así que el pedido vuelve a "pendiente" y se puede reintentar.
        console.error(`No se pudo crear el checkout de ${NOMBRES[order.proveedor]}:`, error.message);
        await orders.updateOne({ _id: order._id, estado: 'procesando' }, { $set: { estado: 'pendiente' } });
        return res.status(502).json({ error: `No se pudo abrir el checkout de ${NOMBRES[order.proveedor]}. Inténtalo de nuevo; si persiste, revisa las credenciales.` });
      }
      await orders.updateOne({ _id: order._id, estado: 'procesando' }, { $set: {
        estado: 'pendiente',
        referenciaExterna: checkout.referencia,
        checkoutUrl: checkout.checkoutUrl,
        mensaje: `Checkout de ${NOMBRES[order.proveedor]} preparado. El pago aún no está confirmado.`
      } });
      const saved = await orders.findById(order._id);
      res.json({ pedido: saved, checkoutUrl: saved.checkoutUrl });
    } catch (error) { next(error); }
  });

  // 3) Verificar: el backend consulta a la pasarela (nunca confía en la URL de retorno).
  router.post('/pedidos/:id/verificar', sameOrigin, loadOrder, async (req, res, next) => {
    try {
      const order = req.order;
      const gateway = gateways[order.proveedor];
      const paymentId = req.body?.payment_id;
      if (paymentId !== undefined && paymentId !== null && !/^\d{1,20}$/.test(String(paymentId))) {
        return res.status(400).json({ error: 'El identificador del pago no es válido.' });
      }
      if (!gateway || !order.referenciaExterna) return res.status(409).json({ error: 'Este pedido aún no tiene un checkout iniciado.' });
      if (!ACTIVE.includes(order.estado)) return res.json({ pedido: order });
      if (!configuration().proveedores[order.proveedor]) {
        return res.status(503).json({ error: `${NOMBRES[order.proveedor]} no está configurado en el servidor.` });
      }
      let result;
      try { result = await gateway.checkPayment(order, { paymentId: paymentId ? String(paymentId) : undefined }); }
      catch (error) {
        console.error(`No se pudo verificar el pago con ${NOMBRES[order.proveedor]}:`, error.message);
        return res.status(502).json({ error: `No se pudo consultar el pago en ${NOMBRES[order.proveedor]}. Inténtalo en unos minutos.` });
      }
      if (result) await orders.updateOne({ _id: order._id, estado: { $in: ACTIVE } }, { $set: result });
      res.json({ pedido: await orders.findById(order._id), sinPago: !result });
    } catch (error) { next(error); }
  });

  // Simulador local: aprueba, rechaza o deja en revisión sin contactar ninguna pasarela.
  router.post('/pedidos/:id/pagar', sameOrigin, loadOrder, async (req, res, next) => {
    try {
      const order = req.order;
      if (order.proveedor !== 'mock') return res.status(409).json({ error: 'Este pedido se paga en la pasarela elegida.' });
      if (!configuration().proveedores.mock) return res.status(503).json({ error: 'El simulador de pagos no está habilitado.' });
      if (order.estado !== 'pendiente') {
        return res.status(order.estado === 'pagado' ? 200 : 409).json({
          pedido: order,
          error: order.estado === 'pagado' ? undefined : 'Este pedido ya tiene un intento de pago. Consulta su estado.'
        });
      }
      const escenario = req.body?.escenario;
      if (!['aprobado', 'rechazado', 'timeout'].includes(escenario)) {
        return res.status(400).json({ error: 'Escenario no válido: usa aprobado, rechazado o timeout.' });
      }
      const claimed = await orders.findOneAndUpdate(
        { _id: order._id, usuario: req.user._id, estado: 'pendiente' },
        { $set: { estado: 'procesando' } },
        { new: true }
      );
      if (!claimed) return res.status(409).json({ error: 'El pedido ya se está procesando. Consulta tus pedidos.' });
      await orders.updateOne({ _id: order._id, estado: 'procesando' }, { $set: simulateCharge(escenario) });
      res.json({ pedido: await orders.findById(order._id) });
    } catch (error) { next(error); }
  });

  return router;
}

export default createPaymentsRouter();
