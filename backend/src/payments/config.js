// Configuración de las pasarelas. Las claves se leen SOLO del archivo backend/.env.
// Todas las integraciones están fijadas a modo de PRUEBA: no se aceptan claves de producción.

export const MP_API = 'https://api.mercadopago.com';
export const STRIPE_API = 'https://api.stripe.com/v1';
export const PAYPAL_API = 'https://api-m.sandbox.paypal.com'; // fijo en sandbox a propósito

export const NOMBRES = { mercadopago: 'Mercado Pago', stripe: 'Stripe', paypal: 'PayPal', mock: 'Simulador' };

const isHttps = value => {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};

export function paymentConfig(env = process.env) {
  const tipoCambio = Number(env.TIPO_CAMBIO_PEN_USD);
  return {
    proveedores: {
      // El Access Token de prueba puede empezar con TEST- o APP_USR- (se verifica más adelante).
      mercadopago: /^(TEST-|APP_USR-)[A-Za-z0-9_-]+$/.test(env.MP_ACCESS_TOKEN || ''),
      // Solo claves de prueba de Stripe; una sk_live_ se rechaza.
      stripe: /^sk_test_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY || ''),
      paypal: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
      // Simulador local sin pasarela; nunca disponible en producción.
      mock: env.PAGOS_SIMULADOR !== 'false' && env.NODE_ENV !== 'production'
    },
    // Precios en soles; Stripe y PayPal sandbox cobran en dólares con este tipo de cambio de prueba.
    tipoCambio: Number.isFinite(tipoCambio) && tipoCambio > 0 ? tipoCambio : 3.75
  };
}

// Dirección del frontend a la que vuelve el comprador después de pagar.
export function clientOrigin(env = process.env) {
  return (env.CLIENT_ORIGIN || 'https://localhost:5173').replace(/\/$/, '');
}

// Orígenes desde los que se puede usar la tienda: CLIENT_ORIGIN y, si existe, el dominio
// público de ngrok (MP_BACK_URL_BASE).
export function allowedOrigins(env = process.env) {
  const origins = [clientOrigin(env)];
  if (isHttps(env.MP_BACK_URL_BASE)) origins.push(new URL(env.MP_BACK_URL_BASE).origin);
  return [...new Set(origins)];
}

// El comprador vuelve al mismo dominio desde el que pagó (localhost o ngrok).
export function originFor(req, env = process.env) {
  const origin = req?.get?.('origin');
  return allowedOrigins(env).includes(origin) ? origin : clientOrigin(env);
}

export function returnUrl(order, proveedor, { env = process.env, base, extra = {} } = {}) {
  const url = new URL('/', base || clientOrigin(env));
  url.searchParams.set('checkout', proveedor);
  url.searchParams.set('pedido', String(order._id));
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return url.toString();
}

export const isLocalUrl = value => {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname); } catch { return true; }
};

export function mercadoPagoWebhook(env = process.env) {
  return env.MP_WEBHOOK_SECRET && isHttps(env.MP_WEBHOOK_URL) ? env.MP_WEBHOOK_URL : null;
}

export function warnInvalidKeys(env = process.env) {
  if (env.STRIPE_SECRET_KEY && !paymentConfig(env).proveedores.stripe) {
    console.warn('STRIPE_SECRET_KEY ignorada: solo se aceptan claves de prueba (sk_test_...).');
  }
  if (env.MP_ACCESS_TOKEN && !paymentConfig(env).proveedores.mercadopago) {
    console.warn('MP_ACCESS_TOKEN con formato no válido: copia el Access Token de prueba de tu aplicación.');
  }
  if (env.MP_WEBHOOK_SECRET && env.MP_WEBHOOK_SECRET === env.MP_ACCESS_TOKEN) {
    console.warn('MP_WEBHOOK_SECRET no debe ser el Access Token: usa la "clave secreta" de la sección Webhooks.');
  }
}

// Llamada HTTP con límite de tiempo. Devuelve el JSON o lanza un error sin exponer claves.
export async function requestJson(fetcher, url, options, label) {
  const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.message || data?.error?.message || data?.error_description || data?.name || data?.error || 'sin detalle';
    const error = new Error(`${label} respondió HTTP ${response.status}: ${typeof detail === 'string' ? detail : 'sin detalle'}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
