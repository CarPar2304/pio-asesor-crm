import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { User, Lock, ArrowRight } from 'lucide-react';
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
    <div className="relative flex min-h-screen items-center justify-center px-4 bg-gradient-to-br from-[hsl(234,49%,92%)] via-[hsl(280,40%,90%)] to-[hsl(331,75%,92%)]">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[hsl(234,49%,37%)] opacity-10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[hsl(331,75%,47%)] opacity-10 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-[hsl(234,49%,50%)] opacity-[0.07] blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/60 bg-white/70 p-8 shadow-xl backdrop-blur-xl">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={logoCCC} alt="Cámara de Comercio de Cali" className="mb-4 h-16 w-auto" />
          <h1 className="text-2xl font-bold text-[hsl(234,49%,20%)]">Pioneros Globales</h1>
          <p className="mt-1 text-sm text-muted-foreground">Inicia sesión para continuar</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="group relative">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              placeholder=" "
              className="peer w-full rounded-lg border border-border bg-white/80 px-10 py-3 text-sm text-foreground placeholder-transparent outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <label className="pointer-events-none absolute left-10 top-3 text-sm text-muted-foreground transition-all peer-focus:-top-2.5 peer-focus:left-3 peer-focus:text-xs peer-focus:text-primary peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-3 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-primary">
              Correo electrónico
            </label>
            <User className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          </div>

          <div className="group relative">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder=" "
              className="peer w-full rounded-lg border border-border bg-white/80 px-10 py-3 text-sm text-foreground placeholder-transparent outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <label className="pointer-events-none absolute left-10 top-3 text-sm text-muted-foreground transition-all peer-focus:-top-2.5 peer-focus:left-3 peer-focus:text-xs peer-focus:text-primary peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-3 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-primary">
              Contraseña
            </label>
            <Lock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="group flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
            {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
          </button>
        </form>
      </div>
    </div>
  );
}
