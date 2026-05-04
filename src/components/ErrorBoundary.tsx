import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Detect common DOM mutation crash from auto-translation extensions
    const msg = error?.message || '';
    const isTranslateCrash =
      msg.includes("removeChild") ||
      msg.includes("insertBefore") ||
      msg.includes("Failed to execute");
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', isTranslateCrash ? '(probable browser translation conflict)' : '', error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const msg = this.state.error?.message || '';
    const isTranslateCrash = msg.includes("removeChild") || msg.includes("insertBefore");
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-3">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h3 className="text-base font-semibold mb-1">{this.props.fallbackTitle || 'Algo se interrumpió'}</h3>
        <p className="max-w-md text-sm text-muted-foreground mb-4">
          {isTranslateCrash
            ? 'Tu navegador está traduciendo esta página automáticamente, lo cual interfiere con el CRM. Desactiva la traducción para este sitio y recarga.'
            : 'Ocurrió un error al renderizar esta sección. Puedes reintentar o recargar la página.'}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={this.reset}>Reintentar</Button>
          <Button size="sm" onClick={this.reload} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Recargar</Button>
        </div>
      </div>
    );
  }
}
