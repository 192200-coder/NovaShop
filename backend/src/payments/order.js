import { randomUUID } from 'node:crypto';

export class PaymentError extends Error {}

// Recibe [{ producto, cantidad }] del navegador y calcula todo con los precios de MongoDB.
// El navegador nunca decide cuánto se cobra.
export function calculateOrder(items, products) {
  if (!Array.isArray(items) || !items.length || items.length > 50) throw new PaymentError('El carrito debe contener entre 1 y 50 productos.');
  const ids = new Set();
  const lines = items.map(item => {
    if (!item || typeof item.producto !== 'string' || !/^[a-f0-9]{24}$/i.test(item.producto) ||
      !Number.isSafeInteger(item.cantidad) || item.cantidad < 1 || item.cantidad > 100 || ids.has(item.producto)) {
      throw new PaymentError('Revisa los productos y cantidades del carrito.');
    }
    ids.add(item.producto);
    const product = products.find(p => String(p._id) === item.producto);
    if (!product || product.stock < item.cantidad) throw new PaymentError('Un producto ya no está disponible o no tiene suficiente stock.');
    const cents = Math.round(product.precio * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0) throw new PaymentError('Precio de producto no válido.');
    return { producto: item.producto, nombre: product.nombre, cantidad: item.cantidad, precioCentimos: cents };
  });
  const totalCentimos = lines.reduce((sum, item) => sum + item.precioCentimos * item.cantidad, 0);
  if (!Number.isSafeInteger(totalCentimos) || totalCentimos < 100 || totalCentimos > 999900) {
    throw new PaymentError('Para esta prueba, el total debe estar entre S/ 1.00 y S/ 9,999.00.');
  }
  return { items: lines, totalCentimos };
}

// Precio unitario en centavos de dólar. Stripe y PayPal usan la misma conversión,
// así el total guardado en el pedido coincide con la suma de sus líneas.
export const usdUnitCents = (precioCentimos, tipoCambio) => Math.max(1, Math.round(precioCentimos / tipoCambio));

export function chargeAmount(order, proveedor, tipoCambio) {
  if (proveedor === 'mercadopago' || proveedor === 'mock') {
    return { moneda: 'PEN', centavos: order.totalCentimos };
  }
  const centavos = order.items.reduce((sum, item) => sum + usdUnitCents(item.precioCentimos, tipoCambio) * item.cantidad, 0);
  if (centavos < 50) throw new PaymentError('El total convertido es menor al mínimo de la pasarela (US$ 0.50).');
  return { moneda: 'USD', centavos, tipoCambio };
}

export const formatAmount = centavos => (centavos / 100).toFixed(2);

export function simulateCharge(escenario) {
  if (escenario === 'aprobado') return { estado: 'pagado', cargoId: `mock_pago_${randomUUID()}`, mensaje: 'Pago simulado aprobado. No se contactó ninguna pasarela ni se cobró dinero.' };
  if (escenario === 'rechazado') return { estado: 'rechazado', mensaje: 'Pago simulado rechazado. No se cobró dinero.' };
  if (escenario === 'timeout') return { estado: 'revision', mensaje: 'Timeout simulado: resultado incierto. No se permite otro intento sobre este pedido.' };
  throw new PaymentError('Escenario no válido: usa aprobado, rechazado o timeout.');
}
