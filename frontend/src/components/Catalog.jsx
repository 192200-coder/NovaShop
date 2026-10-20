import { Search, Plus } from 'lucide-react';
import ProductCard from './ProductCard.jsx';

export default function Catalog({
  search,
  onSearchChange,
  categories,
  category,
  onSelectCategory,
  loading,
  error,
  shownProducts,
  onAddToCart,
  onOpenAddModal,
  onEditProduct,
  onDeleteProduct
}) {
  return (
    <section className="catalog container" id="productos">
      <div className="section-heading">
        <div>
          <span className="eyebrow">NUESTRO CATÁLOGO</span>
          <h2>Encuentra tu favorito</h2>
          <p>Explora nuestros productos destacados</p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="search">
            <Search size={19} />
            <input
              placeholder="Buscar producto..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
            />
          </label>
          <button className="primary-link" onClick={onOpenAddModal} style={{ padding: '0.6rem 1rem', fontSize: '0.9rem', cursor: 'pointer' }}>
            <Plus size={18} /> Nuevo producto
          </button>
        </div>
      </div>

      <div className="categories">
        {categories.map(c => (
          <button
            key={c}
            className={category === c ? 'active' : ''}
            onClick={() => onSelectCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="notice">Cargando productos...</p>
      ) : error ? (
        <p className="notice error">{error}</p>
      ) : shownProducts.length ? (
        <div className="product-grid">
          {shownProducts.map(p => (
            <ProductCard key={p._id} producto={p} onAdd={onAddToCart} onEdit={onEditProduct} onDelete={onDeleteProduct} />
          ))}
        </div>
      ) : (
        <p className="notice">No hay productos con estos filtros.</p>
      )}
    </section>
  );
}