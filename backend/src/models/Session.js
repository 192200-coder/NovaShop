import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  expiresAt: { type: Date, required: true, expires: 0 }
});
export default mongoose.model('Sesion', schema);
