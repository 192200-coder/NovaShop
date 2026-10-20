// src/api.js
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

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