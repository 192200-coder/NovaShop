import mongoose from 'mongoose';

// Un pedido guarda una "fotografía" de los productos y precios al momento de comprar.
// El total siempre se calcula en el servidor (céntimos enteros para evitar errores de redondeo).
const schema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
  items: [{
    _id: false,
    producto: { type: mongoose.Schema.Types.ObjectId, required: true },
    nombre: { type: String, required: true },
    cantidad: { type: Number, required: true },
    precioCentimos: { type: Number, required: true }
  }],
  totalCentimos: { type: Number, required: true },
  moneda: { type: String, default: 'PEN', enum: ['PEN'] },
  // Monto enviado a la pasarela. Mercado Pago cobra en soles; Stripe y PayPal (sandbox) en dólares.
  cobro: {
    _id: false,
    moneda: { type: String, enum: ['PEN', 'USD'], required: true },
    centavos: { type: Number, required: true },
    tipoCambio: Number
  },
  proveedor: { type: String, enum: ['mercadopago', 'stripe', 'paypal', 'mock'], required: true },
  estado: { type: String, enum: ['pendiente', 'procesando', 'pagado', 'rechazado', 'revision'], default: 'pendiente' },
  // ID de la preferencia (Mercado Pago), de la sesión (Stripe) o de la orden (PayPal).
  referenciaExterna: String,
  checkoutUrl: String,
  // ID del pago/captura confirmado por la pasarela.
  cargoId: String,
  mensaje: String,
  modo: { type: String, default: 'test', enum: ['test'] }
}, { timestamps: true, collection: 'pedidos' });

schema.index(
  { proveedor: 1, referenciaExterna: 1 },
  { unique: true, partialFilterExpression: { referenciaExterna: { $type: 'string' } } }
);

export default mongoose.model('Pedido', schema);
