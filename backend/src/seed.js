import 'dotenv/config';
import mongoose from 'mongoose';
import Product from './models/Product.js';
if (!process.env.MONGODB_URI) throw new Error('Configura MONGODB_URI en .env');
const datos = [
    { nombre: 'Laptop Lenovo IdeaPad', descripcion: 'Laptop de estudio y trabajo, 16 GB RAM.', precio: 2950, categoria: 'Computadoras', stock: 8, imagen: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=900' },
    { nombre: 'Mouse inalámbrico', descripcion: 'Mouse ergonómico para oficina.', precio: 65, categoria: 'Accesorios', stock: 30, imagen: 'https://images.unsplash.com/photo-1527814050087-3793815479db?w=900' },
    { nombre: 'Teclado mecánico', descripcion: 'Teclado compacto para programación.', precio: 190, categoria: 'Accesorios', stock: 12, imagen: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=900' },
    { nombre: 'Audífonos', descripcion: 'Audífonos cómodos para videollamadas.', precio: 120, categoria: 'Audio', stock: 18, imagen: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900' },
    { nombre: 'Monitor 24 pulgadas', descripcion: 'Pantalla Full HD para productividad.', precio: 610, categoria: 'Computadoras', stock: 6, imagen: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=900' },
    { nombre: 'Parlante bluetooth', descripcion: 'Altavoz portátil compacto.', precio: 160, categoria: 'Audio', stock: 10, imagen: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=900' }
];
try {
    await mongoose.connect(process.env.MONGODB_URI); const n = await Product.countDocuments();
    if (n) { console.log('La colección productos ya tiene ' + n + ' registros; no se duplicarán.'); }
    else { const r = await Product.insertMany(datos); console.log(`Se insertaron ${r.length} productos.`); }
} finally { await mongoose.disconnect(); }
