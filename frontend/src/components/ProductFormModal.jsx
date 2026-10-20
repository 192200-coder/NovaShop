// src/components/ProductFormModal.jsx
import { useEffect, useState } from 'react';
import { X, PlusCircle, Save } from 'lucide-react';

const EMPTY_FORM = {
  nombre: '',
  descripcion: '',
  precio: '',
  categoria: '',
  nuevaCategoria: '',
  stock: '',
  imagen: ''
};

// Si recibe `product` funciona en modo edición; si no, en modo creación.
export default function ProductFormModal({ isOpen, onClose, onSubmit, categories, product }) {
  const isEdit = Boolean(product);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setFormData(product ? {
      nombre: product.nombre,
      descripcion: product.descripcion || '',
      precio: String(product.precio),
      categoria: product.categoria,
      nuevaCategoria: '',
      stock: String(product.stock),
      imagen: product.imagen || ''
    } : EMPTY_FORM);
  }, [isOpen, product]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const selectedCategory = formData.categoria === '__nueva__' 
      ? formData.nuevaCategoria.trim() 
      : formData.categoria;

    if (!formData.nombre.trim() || !formData.precio || !selectedCategory || !formData.stock) {
      setError('Por favor completa todos los campos obligatorios.');
      return;
    }

    const newProduct = {
      nombre: formData.nombre.trim(),
      descripcion: formData.descripcion.trim(),
      precio: Number(formData.precio),
      categoria: selectedCategory,
      stock: Number(formData.stock),
      imagen: formData.imagen.trim()
    };

    try {
      setLoading(true);
      await onSubmit(newProduct);
      onClose();
    } catch (err) {
      setError(err.message || 'Error al guardar el producto.');
    } finally {
      setLoading(false);
    }
  };

  const existingCategories = categories.filter(c => c !== 'Todas');

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <aside className="cart-panel" onMouseDown={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="cart-title">
          <div>
            <h2>{isEdit ? 'Editar Producto' : 'Agregar Nuevo Producto'}</h2>
            <p>{isEdit ? 'Actualiza los datos del artículo' : 'Registra un artículo en el catálogo'}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          {error && <p className="notice error">{error}</p>}

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.9rem', fontWeight: 600 }}>
            Nombre del producto *
            <input
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              placeholder="Ej. Teclado mecánico"
              required
              style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #ccc' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.9rem', fontWeight: 600 }}>
            Descripción
            <textarea
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              placeholder="Ej. Teclado compacto para programación."
              rows={2}
              style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #ccc', resize: 'vertical' }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.9rem', fontWeight: 600 }}>
              Precio (S/) *
              <input
                type="number"
                step="0.01"
                name="precio"
                value={formData.precio}
                onChange={handleChange}
                placeholder="190"
                required
                style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #ccc' }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.9rem', fontWeight: 600 }}>
              Stock disponible *
              <input
                type="number"
                name="stock"
                value={formData.stock}
                onChange={handleChange}
                placeholder="12"
                required
                style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #ccc' }}
              />
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.9rem', fontWeight: 600 }}>
            Categoría *
            <select
              name="categoria"
              value={formData.categoria}
              onChange={handleChange}
              required
              style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #ccc' }}
            >
              <option value="">Selecciona una categoría</option>
              {existingCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              <option value="__nueva__">+ Otra (nueva categoría)...</option>
            </select>
          </label>

          {formData.categoria === '__nueva__' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.9rem', fontWeight: 600 }}>
              Nombre de la nueva categoría *
              <input
                type="text"
                name="nuevaCategoria"
                value={formData.nuevaCategoria}
                onChange={handleChange}
                placeholder="Ej. Accesorios"
                required
                style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #ccc' }}
              />
            </label>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.9rem', fontWeight: 600 }}>
            URL de la imagen (opcional)
            <input
              type="url"
              name="imagen"
              value={formData.imagen}
              onChange={handleChange}
              placeholder="https://images.unsplash.com/photo-..."
              style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid #ccc' }}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="checkout"
            style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            {isEdit ? <Save size={18} /> : <PlusCircle size={18} />}
            {loading ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Guardar Producto'}
          </button>
        </form>
      </aside>
    </div>
  );
}