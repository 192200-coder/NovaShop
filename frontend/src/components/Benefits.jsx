import { Truck, ShieldCheck, Headphones } from 'lucide-react';

export default function Benefits() {
  return (
    <section className="benefits container" id="nosotros">
      <div>
        <Truck />
        <span><b>Compra desde casa</b><small>Catálogo en línea</small></span>
      </div>
      <div>
        <ShieldCheck />
        <span><b>Proyecto didáctico</b><small>Sin pagos reales</small></span>
      </div>
      <div>
        <Headphones />
        <span><b>Explora y aprende</b><small>React + MongoDB</small></span>
      </div>
    </section>
  );
}