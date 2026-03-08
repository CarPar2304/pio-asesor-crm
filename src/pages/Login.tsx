import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { User, Lock, ArrowRight } from 'lucide-react';
import { SmokeyBackground } from '@/components/ui/smokey-background';
import logoCCC from '@/assets/logo-ccc.png';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <SmokeyBackground color="#313b8e" backdropBlurAmount="sm" />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/20 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={logoCCC} alt="Cámara de Comercio de Cali" className="mb-4 h-16 w-auto drop-shadow-lg" />
          <h1 className="text-2xl font-bold text-white">Pioneros Globales</h1>
          <p className="mt-1 text-sm text-white/70">Inicia sesión para continuar</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          {/* Email */}
          <div className="group relative">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              placeholder=" "
              className="peer w-full rounded-lg border border-white/20 bg-white/5 px-10 py-3 text-sm text-white placeholder-transparent outline-none transition-all focus:border-white/50 focus:bg-white/10 focus:ring-2 focus:ring-white/20"
            />
            <label className="pointer-events-none absolute left-10 top-3 text-sm text-white/50 transition-all peer-focus:-top-2.5 peer-focus:left-3 peer-focus:text-xs peer-focus:text-white/80 peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-3 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-white/80">
              Correo electrónico
            </label>
            <User className="absolute left-3 top-3.5 h-4 w-4 text-white/40" />
          </div>

          {/* Password */}
          <div className="group relative">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder=" "
              className="peer w-full rounded-lg border border-white/20 bg-white/5 px-10 py-3 text-sm text-white placeholder-transparent outline-none transition-all focus:border-white/50 focus:bg-white/10 focus:ring-2 focus:ring-white/20"
            />
            <label className="pointer-events-none absolute left-10 top-3 text-sm text-white/50 transition-all peer-focus:-top-2.5 peer-focus:left-3 peer-focus:text-xs peer-focus:text-white/80 peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-3 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-white/80">
              Contraseña
            </label>
            <Lock className="absolute left-3 top-3.5 h-4 w-4 text-white/40" />
          </div>

          {error && (
            <p className="rounded-md bg-red-500/20 px-3 py-2 text-center text-sm text-red-200">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="group flex w-full items-center justify-center gap-2 rounded-lg bg-white/20 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/30 disabled:opacity-50"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
            {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
          </button>
        </form>
      </div>
    </div>
  );
}
