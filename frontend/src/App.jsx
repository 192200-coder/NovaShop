import { useEffect, useMemo, useState } from 'react';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import Benefits from './components/Benefits.jsx';
import Catalog from './components/Catalog.jsx';
import CartDrawer from './components/CartDrawer.jsx';
import AddProductModal from './components/AddProductModal.jsx';
import Footer from './components/Footer.jsx';
import { getProducts, createProduct } from './api.js';

export default function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [cart, setCart] = useState({});
  const [openCart, setOpenCart] = useState(false);
  const [openAddModal, setOpenAddModal] = useState(false);

  useEffect(() => {
    let active = true;
    getProducts()
      .then(data => { if (active) setProducts(data); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const categories = useMemo(
    () => ['Todas', ...new Set(products.map(p => p.categoria))],
    [products]
  );

  const shown = products.filter(
    p => (category === 'Todas' || p.categoria === category) &&
         p.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const items = Object.entries(cart)
    .map(([id, qty]) => ({ producto: products.find(p => p._id === id), qty }))
    .filter(x => x.producto);

  const count = items.reduce((n, x) => n + x.qty, 0);
  const total = items.reduce((n, x) => n + x.qty * x.producto.precio, 0);

  function add(p) {
    setCart(prev => ({
      ...prev,
      [p._id]: Math.min(p.stock, (prev[p._id] || 0) + 1)
    }));
    setOpenCart(true);
  }

  function adjust(p, diff) {
    setCart(prev => {
      const next = { ...prev };
      const n = Math.max(0, Math.min(p.stock, (next[p._id] || 0) + diff));
      if (n === 0) delete next[p._id];
      else next[p._id] = n;
      return next;
    });
  }

  async function handleCreateProduct(newProductData) {
    const created = await createProduct(newProductData);
    setProducts(prev => [created, ...prev]);
  }

  return (
    <>
      <Header cartCount={count} onOpenCart={() => setOpenCart(true)} />
      <main id="inicio">
        <Hero />
        <Benefits />
        <Catalog
          search={search}
          onSearchChange={setSearch}
          categories={categories}
          category={category}
          onSelectCategory={setCategory}
          loading={loading}
          error={error}
          shownProducts={shown}
          onAddToCart={add}
          onOpenAddModal={() => setOpenAddModal(true)}
        />
      </main>
      <Footer />
      <CartDrawer
        isOpen={openCart}
        onClose={() => setOpenCart(false)}
        items={items}
        count={count}
        total={total}
        onAdjust={adjust}
      />
      <AddProductModal
        isOpen={openAddModal}
        onClose={() => setOpenAddModal(false)}
        onProductCreated={handleCreateProduct}
        categories={categories}
      />
    </>
  );
}