import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import productsRouter from './routes/products.js';
const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '100kb' }));
app.get('/api/salud', (_req, res) => res.json({ estado: 'ok', baseDeDatos: mongoose.connection.readyState === 1 ? 'conectada' : 'desconectada' }));
app.use('/api/productos', productsRouter);
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Error del servidor' }); });
const uri = process.env.MONGODB_URI;
if (!uri) { console.error('Falta MONGODB_URI en backend/.env'); process.exit(1); }
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('MongoDB conectado'); app.listen(process.env.PORT || 4000, () => console.log('API en http://localhost:' + (process.env.PORT || 4000)));
} catch (err) { console.error('No fue posible conectar a MongoDB:', err.message); process.exit(1); }
