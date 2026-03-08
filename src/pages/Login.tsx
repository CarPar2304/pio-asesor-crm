import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { User, Lock, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 bg-gradient-to-br from-[hsl(210,60%,95%)] via-[hsl(220,55%,90%)] to-[hsl(234,49%,85%)]">
      {/* Animated decorative blobs */}
      <motion.div
        className="pointer-events-none absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-[hsl(214,80%,50%)] opacity-[0.12] blur-3xl"
        animate={{ x: [0, 60, -30, 0], y: [0, -40, 50, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-[hsl(234,49%,37%)] opacity-[0.12] blur-3xl"
        animate={{ x: [0, -50, 40, 0], y: [0, 50, -30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute left-1/3 top-1/4 h-80 w-80 rounded-full bg-[hsl(220,60%,55%)] opacity-[0.08] blur-3xl"
        animate={{ x: [0, 40, -60, 0], y: [0, 60, -20, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute right-1/4 bottom-1/3 h-64 w-64 rounded-full bg-[hsl(210,70%,45%)] opacity-[0.06] blur-3xl"
        animate={{ x: [0, -30, 50, 0], y: [0, -50, 30, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/60 bg-white/70 p-8 shadow-xl backdrop-blur-xl"
      >
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={logoCCC} alt="Cámara de Comercio de Cali" className="mb-4 h-16 w-auto" />
          <h1 className="text-2xl font-bold text-foreground">Pioneros Globales</h1>
          <p className="mt-1 text-sm text-muted-foreground">Inicia sesión para continuar</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="relative">
            <User className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="Correo electrónico"
              className="w-full rounded-lg border border-border bg-white/80 px-10 py-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Contraseña"
              className="w-full rounded-lg border border-border bg-white/80 px-10 py-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
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
      </motion.div>
    </div>
  );
}
