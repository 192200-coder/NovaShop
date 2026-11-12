// Datos de presentación de los medios de pago y de los estados del pedido.

export const PROVIDERS = {
  mercadopago: { nombre: 'Mercado Pago', detalle: 'Tarjetas de prueba, cobro en soles (PEN)' },
  stripe: { nombre: 'Stripe', detalle: 'Tarjeta 4242 4242 4242 4242, cobro en dólares (USD)' },
  paypal: { nombre: 'PayPal', detalle: 'Cuenta personal sandbox, cobro en dólares (USD)' },
  mock: { nombre: 'Simulador', detalle: 'Sin pasarela: eliges el resultado' }
};

export const STATES = {
  pendiente: 'Pendiente de pago',
  procesando: 'Procesando',
  pagado: 'Pagado',
  rechazado: 'Rechazado',
  revision: 'En revisión'
};

// Solo se redirige a dominios oficiales de cada pasarela.
const ALLOWED_HOSTS = {
  mercadopago: h => /(^|\.)mercadopago\.com(\.pe)?$/.test(h),
  stripe: h => h === 'checkout.stripe.com',
  paypal: h => h === 'www.sandbox.paypal.com' || h === 'sandbox.paypal.com'
};

export function safeCheckoutUrl(proveedor, value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && ALLOWED_HOSTS[proveedor]?.(url.hostname)) return url.toString();
  } catch { /* URL inválida */ }
  return null;
}

export const usd = centavos => `US$ ${(centavos / 100).toFixed(2)}`;
export const soles = centimos => `S/ ${(centimos / 100).toFixed(2)}`;

// Misma conversión que el backend (por línea), para mostrar una estimación antes de pagar.
export const estimateUsd = (items, tipoCambio) =>
  items.reduce((sum, { producto, qty }) => sum + Math.max(1, Math.round(Math.round(producto.precio * 100) / tipoCambio)) * qty, 0);
