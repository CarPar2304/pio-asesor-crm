import { Compass } from 'lucide-react';

export default function Enrutador() {
  return (
    <div className="container flex flex-col items-center justify-center py-24">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
        <Compass className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="mt-6 text-xl font-bold">Enrutador</h2>
      <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
        El módulo de enrutamiento estratégico está en desarrollo. Aquí podrás clasificar y dirigir empresas a los programas adecuados.
      </p>
      <div className="mt-6 rounded-full bg-secondary px-4 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">Próximamente</span>
      </div>
    </div>
  );
}
