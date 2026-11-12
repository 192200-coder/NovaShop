import { useState } from 'react';
import { X, Eye, EyeOff, LogIn } from 'lucide-react';
import { login } from '../api.js';

const DEMO_USERS = [
  ['Ana Demo', 'ana@novashop.test', 'AnaDemo2026!'],
  ['Miguel Demo', 'miguel@novashop.test', 'MiguelDemo2026!']
];

export default function LoginModal({ isOpen, onClose, onLogin, notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(await login(email, password));
      setPassword('');
    } catch (err) {
      setError(err.message || 'No se pudo conectar con el servidor.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={busy ? undefined : onClose}>
      <aside className="cart-panel" role="dialog" aria-modal="true" aria-labelledby="login-title" onMouseDown={e => e.stopPropagation()}>
        <div className="cart-title">
          <div>
            <h2 id="login-title">Iniciar sesión</h2>
            <p>Necesitas una cuenta para pagar y ver tus pedidos.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar" disabled={busy}><X /></button>
        </div>

        <form className="panel-body form-stack" onSubmit={submit}>
          {notice && <p className="inline-note">{notice}</p>}
          <label className="field">
            Correo electrónico
            <input type="email" autoComplete="username" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="field">
            Contraseña
            <span className="password-field">
              <input type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} />
              <button type="button" onClick={() => setVisible(v => !v)} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {visible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="checkout" type="submit" disabled={busy}>
            <LogIn size={18} /> {busy ? 'Ingresando…' : 'Iniciar sesión'}
          </button>

          <div className="demo-users">
            <b>Usuarios de prueba</b>
            <p>Pulsa una cuenta para completar el formulario.</p>
            {DEMO_USERS.map(([name, mail, pass]) => (
              <button key={mail} type="button" disabled={busy} onClick={() => { setEmail(mail); setPassword(pass); setError(''); }}>
                <strong>{name}</strong><span>{mail}</span>
              </button>
            ))}
          </div>
        </form>
      </aside>
    </div>
  );
}
