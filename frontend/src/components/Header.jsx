import { ShoppingBag, ShoppingCart } from 'lucide-react';

export default function Header({ cartCount, onOpenCart }) {
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
          <button className="cart-button" onClick={onOpenCart} aria-label="Abrir carrito">
            <ShoppingCart size={21} /> <span>Carrito</span>
            <b>{cartCount}</b>
          </button>
        </div>
      </header>
    </>
  );
}