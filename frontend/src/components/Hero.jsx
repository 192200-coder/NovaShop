import { ArrowRight } from 'lucide-react';

export default function Hero() {
  return (
    <section className="hero">
      <div className="container hero-inner">
        <div className="hero-text">
          <span className="eyebrow">TECNOLOGÍA PARA TU DÍA A DÍA</span>
          <h1>Todo lo que necesitas, <em>en un solo lugar.</em></h1>
          <p>Descubre productos de tecnología seleccionados para estudiar, trabajar y disfrutar. Compra simple, compra inteligente.</p>
          <a className="primary-link" href="#productos">
            Explorar productos <ArrowRight size={19} />
          </a>
          <div className="hero-stats">
            <div><b>100%</b><span>Compra fácil</span></div>
            <div><b>+6</b><span>Productos de muestra</span></div>
            <div><b>24/7</b><span>Catálogo disponible</span></div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="circle-bg"></div>
          <div className="floating-card card-a">✦ Tu próxima gran compra</div>
          <div className="hero-emoji">💻</div>
          <div className="floating-card card-b">✓ Productos destacados</div>
        </div>
      </div>
    </section>
  );
}