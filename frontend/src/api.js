// src/api.js
const BASE = import.meta.env.VITE_API_URL || '/api';

export async function getProducts(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v !== undefined)
  );
  const res = await fetch(`${BASE}/productos?${query}`);
  if (!res.ok) {
    throw new Error('No se pudieron cargar los productos. Revisa que el backend esté ejecutándose.');
  }
  return res.json();
}

export async function updateProduct(id, productData) {
  const res = await fetch(`${BASE}/productos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(productData),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'No se pudo actualizar el producto.');
  }
  return res.json();
}

export async function deleteProduct(id) {
  const res = await fetch(`${BASE}/productos/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'No se pudo eliminar el producto.');
  }
}

// ---- Sesión y pagos (envían la cookie de sesión con credentials: 'include') ----
async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'No se pudo conectar con el servidor.');
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const getCurrentUser = () => request('/auth/me').then(d => d.usuario);
export const login = (email, password) =>
  request('/auth/login', { method: 'POST', body: { email, password } }).then(d => d.usuario);
export const logout = () => request('/auth/logout', { method: 'POST' });

export const getPaymentConfig = () => request('/pagos/config');
export const getOrders = () => request('/pagos/pedidos');
export const getOrder = id => request(`/pagos/pedidos/${id}`);
export const createOrder = (items, proveedor) =>
  request('/pagos/pedidos', { method: 'POST', body: { items, proveedor } });
export const startCheckout = id => request(`/pagos/pedidos/${id}/checkout`, { method: 'POST', body: {} });
export const verifyPayment = (id, paymentId) =>
  request(`/pagos/pedidos/${id}/verificar`, { method: 'POST', body: paymentId ? { payment_id: String(paymentId) } : {} });
export const simulatePayment = (id, escenario) =>
  request(`/pagos/pedidos/${id}/pagar`, { method: 'POST', body: { escenario } });

export async function createProduct(productData) {
  const res = await fetch(`${BASE}/productos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(productData),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || 'No se pudo registrar el producto. Inténtalo de nuevo.');
  }

  return res.json();
}