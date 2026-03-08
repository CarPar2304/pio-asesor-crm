import { BarChart3 } from 'lucide-react';

export default function Stats() {
  return (
    <div className="container flex flex-col items-center justify-center py-24">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
        <BarChart3 className="h-8 w-8 text-secondary-foreground" />
      </div>
      <h2 className="mt-6 text-xl font-bold">Stats</h2>
      <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
        El módulo de estadísticas y reportes está en desarrollo. Aquí verás indicadores consolidados del portafolio de empresas.
      </p>
      <div className="mt-6 rounded-full bg-secondary px-4 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">Próximamente</span>
      </div>
    </div>
  );
}
