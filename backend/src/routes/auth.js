import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import User from '../models/User.js';
import Session from '../models/Session.js';
import { hashPassword, verifyPassword, tokenHash } from '../auth.js';
import { allowedOrigins } from '../payments/config.js';

const router = Router();
const cookieName = 'novashop_session';
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'strict', path: '/api' };
const duration = 7 * 24 * 60 * 60 * 1000;
const attempts = new Map();
const dummyHash = hashPassword(randomBytes(32).toString('hex'));
const publicUser = user => ({ id: user._id, nombre: user.nombre, email: user.email });
function readToken(req) {
  return (req.headers.cookie || '').split(';').map(x => x.trim())
    .find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || '';
}
export function sameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (origin && !allowedOrigins().includes(origin)) return res.status(403).json({ error: 'Origen no permitido.' });
  next();
}
export async function requireUser(req, res, next) {
  try {
    const token = readToken(req);
    const session = token && await Session.findOne({ tokenHash: tokenHash(token), expiresAt: { $gt: new Date() } }).populate('user');
    if (!session?.user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    req.user = session.user;
    next();
  } catch (error) { next(error); }
}
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.post('/login', sameOrigin, async (req, res, next) => {
  try {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    const key = req.ip;
    const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    if (entry.count >= 10) return res.status(429).json({ error: 'Demasiados intentos. Inténtalo en 15 minutos.' });
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || !password || password.length > 256) {
      return res.status(400).json({ error: 'Ingresa un correo y una contraseña válidos.' });
    }
    entry.count++;
    attempts.set(key, entry);
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
    const valid = await verifyPassword(password, user?.passwordHash || await dummyHash);
    if (!user || !valid) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    const token = randomBytes(32).toString('hex');
    await Session.create({ tokenHash: tokenHash(token), user: user._id, expiresAt: new Date(now + duration) });
    const previous = readToken(req);
    if (previous) await Session.deleteOne({ tokenHash: tokenHash(previous) });
    attempts.delete(key);
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: duration });
    res.json({ usuario: publicUser(user) });
  } catch (error) { next(error); }
});
router.get('/me', async (req, res, next) => {
  try {
    const token = readToken(req);
    const session = token && await Session.findOne({ tokenHash: tokenHash(token), expiresAt: { $gt: new Date() } }).populate('user');
    if (!session?.user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    res.json({ usuario: publicUser(session.user) });
  } catch (error) { next(error); }
});
router.post('/logout', sameOrigin, async (req, res, next) => {
  try {
    const token = readToken(req);
    if (token) await Session.deleteOne({ tokenHash: tokenHash(token) });
    res.clearCookie(cookieName, cookieOptions);
    res.sendStatus(204);
  } catch (error) { next(error); }
});
export default router;
