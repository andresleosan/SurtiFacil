import { useState } from 'react';
import { getSafeAuthErrorMessage, loginUser } from '../services/authService';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await loginUser(email, password);
    } catch (error) {
      setError(getSafeAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-sf-light text-sf-text font-poppins flex items-center justify-center px-4">
      <section className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <h1 className="mb-6 text-2xl font-bold text-sf-primary">Iniciar sesión</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-semibold">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-semibold">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-sf-primary px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>
      </section>
    </main>
  );
};

export default Login;
