import { useState, useMemo } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCRM } from '@/contexts/CRMContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, X, Upload, AlertTriangle } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast';

interface Props {
  open: boolean;
  onClose: () => void;
  offerId: string;
}

type MatchVariable = 'nit' | 'trade_name' | 'legal_name' | 'contact_email';

const MATCH_OPTIONS: { value: MatchVariable; label: string }[] = [
  { value: 'nit', label: 'NIT' },
  { value: 'trade_name', label: 'Nombre Comercial' },
  { value: 'legal_name', label: 'Razón Social' },
  { value: 'contact_email', label: 'Email de contacto' },
];

interface MatchResult {
  input: string;
  companyId: string | null;
  companyName: string | null;
  alreadyInOffer: boolean;
}

export default function BulkAddToPipelineDialog({ open, onClose, offerId }: Props) {
  const { getStagesForOffer, addCompanyToStage, isCompanyInOffer } = usePortfolio();
  const { companies } = useCRM();

  const [matchVar, setMatchVar] = useState<MatchVariable>('nit');
  const [rawText, setRawText] = useState('');
  const [selectedStageId, setSelectedStageId] = useState('');
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [adding, setAdding] = useState(false);

  const stages = getStagesForOffer(offerId);
  const defaultStageId = stages[0]?.id ?? '';

  const parsedValues = useMemo(() => {
    if (!rawText.trim()) return [];
    return rawText
      .split(/[,\n]+/)
      .map(v => v.trim())
      .filter(v => v.length > 0);
  }, [rawText]);

  const matchResults = useMemo((): MatchResult[] => {
    return parsedValues.map(input => {
      const lower = input.toLowerCase();
      let found: { id: string; tradeName: string } | null = null;

      for (const c of companies) {
        switch (matchVar) {
          case 'nit':
            if (c.nit && c.nit.replace(/[.\-\s]/g, '') === input.replace(/[.\-\s]/g, '')) {
              found = { id: c.id, tradeName: c.tradeName };
            }
            break;
          case 'trade_name':
            if (c.tradeName.toLowerCase() === lower) {
              found = { id: c.id, tradeName: c.tradeName };
            }
            break;
          case 'legal_name':
            if (c.legalName.toLowerCase() === lower) {
              found = { id: c.id, tradeName: c.tradeName };
            }
            break;
          case 'contact_email':
            if (c.contacts?.some(ct => ct.email.toLowerCase() === lower)) {
              found = { id: c.id, tradeName: c.tradeName };
            }
            break;
        }
        if (found) break;
      }

      return {
        input,
        companyId: found?.id ?? null,
        companyName: found?.tradeName ?? null,
        alreadyInOffer: found ? isCompanyInOffer(offerId, found.id) : false,
      };
    });
  }, [parsedValues, companies, matchVar, offerId, isCompanyInOffer]);

  const matched = matchResults.filter(r => r.companyId && !r.alreadyInOffer);
  const alreadyIn = matchResults.filter(r => r.companyId && r.alreadyInOffer);
  const notFound = matchResults.filter(r => !r.companyId);

  const handlePreview = () => {
    if (parsedValues.length === 0) return;
    setStep('preview');
  };

  const handleAdd = async () => {
    const stageId = selectedStageId || defaultStageId;
    if (!stageId || matched.length === 0) return;
    setAdding(true);
    let count = 0;
    for (const r of matched) {
      if (r.companyId) {
        await addCompanyToStage(offerId, stageId, r.companyId);
        count++;
      }
    }
    setAdding(false);
    showSuccess(`${count} empresa(s) agregada(s) al pipeline`);
    handleReset();
    onClose();
  };

  const handleReset = () => {
    setStep('input');
    setRawText('');
    setMatchVar('nit');
    setSelectedStageId('');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Agregar masivamente
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 pt-2">
          {/* Stage selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Etapa destino</label>
            <Select value={selectedStageId || defaultStageId} onValueChange={setSelectedStageId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar etapa" />
              </SelectTrigger>
              <SelectContent>
                {stages.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Match variable */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Variable de cruce</label>
            <Select value={matchVar} onValueChange={v => { setMatchVar(v as MatchVariable); setStep('input'); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATCH_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {step === 'input' && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Valores <span className="text-muted-foreground font-normal">(separados por coma o salto de línea)</span>
                </label>
                <Textarea
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  placeholder={
                    matchVar === 'nit' ? 'Ej: 900123456, 800987654, 901234567' :
                    matchVar === 'contact_email' ? 'Ej: juan@empresa.com, maria@startup.co' :
                    'Ej: Empresa A, Empresa B, Empresa C'
                  }
                  className="min-h-[120px]"
                />
                {parsedValues.length > 0 && (
                  <p className="text-xs text-muted-foreground">{parsedValues.length} valor(es) detectado(s)</p>
                )}
              </div>

              <Button onClick={handlePreview} disabled={parsedValues.length === 0} className="gap-1.5">
                Cruzar y previsualizar
              </Button>
            </>
          )}

          {step === 'preview' && (
            <>
              {/* Summary */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="default" className="gap-1">
                  <Check className="h-3 w-3" /> {matched.length} encontrada(s)
                </Badge>
                {alreadyIn.length > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    Ya en pipeline: {alreadyIn.length}
                  </Badge>
                )}
                {notFound.length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> {notFound.length} no encontrada(s)
                  </Badge>
                )}
              </div>

              <ScrollArea className="flex-1 min-h-0 max-h-[300px]">
                <div className="space-y-1 pr-3">
                  {matched.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/5 px-3 py-1.5 text-sm">
                      <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      <span className="truncate flex-1 min-w-0">{r.input}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[140px]">→ {r.companyName}</span>
                    </div>
                  ))}
                  {alreadyIn.map((r, i) => (
                    <div key={`already-${i}`} className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-1.5 text-sm opacity-60">
                      <Badge variant="secondary" className="text-[10px] shrink-0">Ya existe</Badge>
                      <span className="truncate flex-1 min-w-0">{r.input}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[140px]">→ {r.companyName}</span>
                    </div>
                  ))}
                  {notFound.map((r, i) => (
                    <div key={`nf-${i}`} className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-sm">
                      <X className="h-3.5 w-3.5 text-destructive shrink-0" />
                      <span className="truncate flex-1 min-w-0">{r.input}</span>
                      <span className="text-xs text-muted-foreground">No encontrada</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('input')} className="flex-1">
                  Volver a editar
                </Button>
                <Button onClick={handleAdd} disabled={adding || matched.length === 0} className="flex-1 gap-1.5">
                  {adding ? 'Agregando...' : `Agregar ${matched.length} empresa(s)`}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
