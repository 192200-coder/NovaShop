import mongoose from 'mongoose';
const productSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  descripcion: { type: String, default: '' },
  precio: { type: Number, required: true, min: 0 },
  categoria: { type: String, required: true },
  stock: { type: Number, default: 0, min: 0 },
  imagen: { type: String, default: '' }
}, { timestamps: true });
export default mongoose.model('Producto', productSchema, 'productos');
