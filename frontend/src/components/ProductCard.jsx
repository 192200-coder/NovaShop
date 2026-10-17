import { ShoppingCart, Package } from 'lucide-react';
export default function ProductCard({producto,onAdd}) {
  return <article className="product-card">
    <div className="product-image">{producto.imagen ? <img src={producto.imagen} alt={producto.nombre} loading="lazy"/> : <Package size={64}/>}</div>
    <div className="product-body"><span className="tag">{producto.categoria}</span><h3>{producto.nombre}</h3><p>{producto.descripcion}</p>
      <div className="product-bottom"><div><strong>S/ {producto.precio.toFixed(2)}</strong><small>{producto.stock} disponibles</small></div>
      <button disabled={producto.stock===0} onClick={()=>onAdd(producto)}><ShoppingCart size={17}/> Agregar</button></div>
    </div>
  </article>;
}
