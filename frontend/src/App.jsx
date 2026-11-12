import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import Benefits from './components/Benefits.jsx';
import Catalog from './components/Catalog.jsx';
import CartDrawer from './components/CartDrawer.jsx';
import ProductFormModal from './components/ProductFormModal.jsx';
import Footer from './components/Footer.jsx';
import LoginModal from './components/LoginModal.jsx';
import CheckoutModal from './components/CheckoutModal.jsx';
import OrdersModal from './components/OrdersModal.jsx';
import { getProducts, createProduct, updateProduct, deleteProduct, getCurrentUser, logout, verifyPayment } from './api.js';
import { PROVIDERS } from './utils/payments.js';

// El carrito se guarda en el navegador para no perderlo al ir a la página de la pasarela.
const CART_KEY = 'novashop_carrito';
const readCart = () => {
  try {
    const value = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
};

// Lee y limpia los parámetros con los que la pasarela devuelve al comprador.
function readCheckoutReturn() {
  const url = new URL(window.location.href);
  const proveedor = url.searchParams.get('checkout');
  if (!proveedor) return null;
  const value = {
    proveedor,
    pedido: url.searchParams.get('pedido'),
    paymentId: url.searchParams.get('payment_id') || url.searchParams.get('collection_id'),
    cancelado: url.searchParams.get('cancelado') === '1'
  };
  window.history.replaceState(null, '', url.pathname + url.hash);
  return value;
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [cart, setCart] = useState(readCart);
  const [openCart, setOpenCart] = useState(false);
  const [openAddModal, setOpenAddModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [login, setLogin] = useState({ open: false, notice: '', next: null });
  const [openCheckout, setOpenCheckout] = useState(false);
  const [openOrders, setOpenOrders] = useState(false);
  const [flash, setFlash] = useState(null);
  const [checkoutReturn, setCheckoutReturn] = useState(readCheckoutReturn);

  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* almacenamiento no disponible */ }
  }, [cart]);

  // Recupera la sesión guardada en la cookie del servidor.
  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then(u => { if (active) setUser(u); })
      .catch(() => {})
      .finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, []);

  const clearCart = useCallback(() => setCart({}), []);

  // Al volver de la pasarela, el backend consulta el estado real del pago.
  useEffect(() => {
    if (!checkoutReturn || authLoading) return;
    const nombre = PROVIDERS[checkoutReturn.proveedor]?.nombre || 'la pasarela';
    if (!user) {
      setLogin({ open: true, notice: `Inicia sesión para confirmar tu pago con ${nombre}.`, next: null });
      return;
    }
    const current = checkoutReturn;
    setCheckoutReturn(null);
    if (!/^[a-f0-9]{24}$/i.test(current.pedido || '')) {
      setFlash({ type: 'error', text: 'No se recibió el pedido al volver de la pasarela. Revisa Mis pedidos.' });
      return;
    }
    if (current.cancelado) {
      setFlash({ type: 'info', text: `Cancelaste el pago en ${nombre}. El pedido sigue pendiente en Mis pedidos.` });
      return;
    }
    setFlash({ type: 'info', text: `Verificando tu pago con ${nombre}…` });
    verifyPayment(current.pedido, current.paymentId)
      .then(({ pedido }) => {
        if (pedido.estado === 'pagado') {
          clearCart();
          setFlash({ type: 'success', text: `¡Pago confirmado por ${nombre}! Tu pedido ya aparece en Mis pedidos.` });
        } else if (pedido.estado === 'rechazado') {
          setFlash({ type: 'error', text: `${nombre} rechazó el pago. Tu carrito se conserva para intentarlo de nuevo.` });
        } else {
          setFlash({ type: 'info', text: 'El pago aún no está confirmado. Usa "Verificar pago" en Mis pedidos en unos minutos.' });
        }
      })
      .catch(e => setFlash({ type: 'error', text: `${e.message} Revisa Mis pedidos antes de volver a pagar.` }));
  }, [checkoutReturn, authLoading, user, clearCart]);

  function requireLogin(next, notice) {
    if (user) return true;
    setLogin({ open: true, notice, next });
    return false;
  }

  function handleLogin(u) {
    setUser(u);
    const next = login.next;
    setLogin({ open: false, notice: '', next: null });
    if (next === 'checkout') setOpenCheckout(true);
    if (next === 'orders') setOpenOrders(true);
  }

  async function handleLogout() {
    try { await logout(); } catch { /* la cookie se limpia igualmente al expirar */ }
    setUser(null);
    setOpenOrders(false);
    setOpenCheckout(false);
  }

  function goToCheckout() {
    setOpenCart(false);
    if (requireLogin('checkout', 'Inicia sesión para continuar con el pago. Tu carrito se conserva.')) setOpenCheckout(true);
  }

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

  async function handleUpdateProduct(data) {
    const updated = await updateProduct(editing._id, data);
    setProducts(prev => prev.map(p => (p._id === updated._id ? updated : p)));
    setCart(prev => {
      if (!prev[updated._id]) return prev;
      const next = { ...prev };
      if (updated.stock === 0) delete next[updated._id];
      else next[updated._id] = Math.min(next[updated._id], updated.stock);
      return next;
    });
  }

  async function handleDeleteProduct(p) {
    if (!window.confirm(`¿Eliminar "${p.nombre}"?`)) return;
    try {
      await deleteProduct(p._id);
      setProducts(prev => prev.filter(x => x._id !== p._id));
      setCart(prev => {
        const next = { ...prev };
        delete next[p._id];
        return next;
      });
    } catch (e) {
      window.alert(e.message);
    }
  }

  return (
    <>
      <Header
        cartCount={count}
        onOpenCart={() => setOpenCart(true)}
        user={user}
        authLoading={authLoading}
        onLogin={() => setLogin({ open: true, notice: '', next: null })}
        onLogout={handleLogout}
        onOrders={() => setOpenOrders(true)}
      />
      {flash && (
        <div className={`flash ${flash.type}`} role="status">
          <div className="container">
            <span>{flash.text}</span>
            <button onClick={() => setFlash(null)} aria-label="Cerrar aviso">×</button>
          </div>
        </div>
      )}
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
          onEditProduct={setEditing}
          onDeleteProduct={handleDeleteProduct}
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
        onCheckout={goToCheckout}
      />
      <LoginModal
        isOpen={login.open}
        notice={login.notice}
        onClose={() => setLogin({ open: false, notice: '', next: null })}
        onLogin={handleLogin}
      />
      <CheckoutModal
        isOpen={openCheckout && Boolean(user)}
        items={items}
        onClose={() => setOpenCheckout(false)}
        onPaid={clearCart}
        onShowOrders={() => { setOpenCheckout(false); setOpenOrders(true); }}
      />
      <OrdersModal
        isOpen={openOrders && Boolean(user)}
        onClose={() => setOpenOrders(false)}
      />
      <ProductFormModal
        isOpen={openAddModal}
        onClose={() => setOpenAddModal(false)}
        onSubmit={handleCreateProduct}
        categories={categories}
      />
      <ProductFormModal
        isOpen={Boolean(editing)}
        product={editing}
        onClose={() => setEditing(null)}
        onSubmit={handleUpdateProduct}
        categories={categories}
      />
    </>
  );
}