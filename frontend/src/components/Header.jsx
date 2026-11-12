import { ShoppingBag, ShoppingCart, LogIn, LogOut, ReceiptText } from 'lucide-react';

export default function Header({ cartCount, onOpenCart, user, authLoading, onLogin, onLogout, onOrders }) {
  return (
    <>
      <div className="announcement">
        Envíos a todo el Perú · Proyecto educativo de comercio electrónico
      </div>
      <header className="header">
        <div className="container navbar">
          <a className="brand" href="#inicio">
            <span className="brand-icon"><ShoppingBag size={22} /></span>
            nova<span>shop</span>
          </a>
          <nav>
            <a href="#inicio">Inicio</a>
            <a href="#productos">Productos</a>
            <a href="#nosotros">Nosotros</a>
          </nav>
          <div className="header-actions">
            {!authLoading && (user ? (
              <>
                <span className="greeting">Hola, {user.nombre.split(' ')[0]}</span>
                <button className="account-btn" onClick={onOrders} aria-label="Mis pedidos">
                  <ReceiptText size={18} /> <span>Mis pedidos</span>
                </button>
                <button className="account-btn" onClick={onLogout} aria-label="Cerrar sesión">
                  <LogOut size={18} /> <span>Salir</span>
                </button>
              </>
            ) : (
              <button className="account-btn" onClick={onLogin} aria-label="Iniciar sesión">
                <LogIn size={18} /> <span>Iniciar sesión</span>
              </button>
            ))}
            <button className="cart-button" onClick={onOpenCart} aria-label="Abrir carrito">
              <ShoppingCart size={21} /> <span>Carrito</span>
              <b>{cartCount}</b>
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
