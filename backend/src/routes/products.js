import { Router } from 'express';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
const router = Router();
const escapeRegex = s => s.replace(/[.*+?^${}()|\[\]\\]/g, '\\$&');
router.get('/categorias', async (_req, res, next) => {
  try { res.json(await Product.distinct('categoria')); } catch (e) { next(e); }
});
router.get('/resumen', async (_req, res, next) => {
  try {
    res.json(await Product.aggregate([
      { $group: { _id: '$categoria', cantidad: { $sum: 1 }, precioPromedio: { $avg: '$precio' } } },
      { $sort: { _id: 1 } }
    ]));
  } catch (e) { next(e); }
});
router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.categoria) filter.categoria = String(req.query.categoria);
    if (req.query.buscar) filter.nombre = { $regex: escapeRegex(String(req.query.buscar).slice(0, 80)), $options: 'i' };
    if (req.query.min || req.query.max) {
      filter.precio = {};
      if (req.query.min) { const n = Number(req.query.min); if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Precio mínimo inválido' }); filter.precio.$gte = n; }
      if (req.query.max) { const n = Number(req.query.max); if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Precio máximo inválido' }); filter.precio.$lte = n; }
    }
    res.json(await Product.find(filter).sort({ nombre: 1 }).limit(100).lean());
  } catch (e) { next(e); }
});
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
    const item = await Product.findById(req.params.id); return item ? res.json(item) : res.status(404).json({ error: 'No encontrado' });
  } catch (e) { next(e); }
});
// Rutas de escritura son educativas; no se exponen sin autenticación en este proyecto público.
const pick = body => Object.fromEntries(
  ['nombre', 'descripcion', 'precio', 'categoria', 'stock', 'imagen']
    .filter(k => body?.[k] !== undefined)
    .map(k => [k, body[k]])
);
const handleWriteError = (e, res, next) => (e.name === 'ValidationError' || e.name === 'CastError')
  ? res.status(400).json({ error: e.message })
  : next(e);
router.post('/', async (req, res, next) => {
  try { res.status(201).json(await Product.create(pick(req.body))); } catch (e) { handleWriteError(e, res, next); }
});
router.put('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
    const item = await Product.findByIdAndUpdate(req.params.id, pick(req.body), { new: true, runValidators: true });
    return item ? res.json(item) : res.status(404).json({ error: 'No encontrado' });
  } catch (e) { handleWriteError(e, res, next); }
});
router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
    const item = await Product.findByIdAndDelete(req.params.id);
    return item ? res.status(204).end() : res.status(404).json({ error: 'No encontrado' });
  } catch (e) { next(e); }
});
export default router;
