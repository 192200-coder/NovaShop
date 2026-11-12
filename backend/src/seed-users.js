import './dns.js';
import 'dotenv/config';
import mongoose from 'mongoose';
import User from './models/User.js';
import { hashPassword } from './auth.js';

// Crea dos usuarios de prueba. Si ya existen, no los modifica (no restablece su contraseña).
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  for (const user of [
    { nombre: 'Ana Demo', email: 'ana@novashop.test', password: 'AnaDemo2026!' },
    { nombre: 'Miguel Demo', email: 'miguel@novashop.test', password: 'MiguelDemo2026!' }
  ]) {
    await User.updateOne({ email: user.email }, { $setOnInsert: {
      nombre: user.nombre, email: user.email, passwordHash: await hashPassword(user.password)
    } }, { upsert: true });
    console.log(`Usuario de prueba disponible: ${user.email}`);
  }
} catch (error) {
  console.error('No se pudieron crear los usuarios:', error.message);
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
