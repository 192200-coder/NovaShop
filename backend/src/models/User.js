import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  nombre: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true, select: false }
});
export default mongoose.model('Usuario', schema);
