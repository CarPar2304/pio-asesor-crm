import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useCRM } from '@/contexts/CRMContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Milestone, MilestoneType, MILESTONE_TYPE_LABELS } from '@/types/crm';
import { showSuccess, showError } from '@/lib/toast';
import { format } from 'date-fns';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  companyId?: string;
  companyName?: string;
  /** When provided and no companyId, show a picker limited to companies in this offer's pipeline */
  offerId?: string;
}

const MILESTONE_TYPES = Object.entries(MILESTONE_TYPE_LABELS).map(([value, label]) => ({ value: value as MilestoneType, label }));

export default function PipelineMilestoneDialog({ open, onClose, companyId, companyName, offerId }: Props) {
  const { addMilestone, companies } = useCRM();
  const { getEntriesForOffer } = usePortfolio();

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(companyId || '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [type, setType] = useState<MilestoneType>('capital');
  const [saving, setSaving] = useState(false);

  const needsPicker = !companyId;

  const pickerCompanies = useMemo(() => {
    if (!needsPicker) return [];
    if (offerId) {
      const ids = new Set(getEntriesForOffer(offerId).map(e => e.companyId));
      return companies.filter(c => ids.has(c.id));
    }
    return companies;
  }, [needsPicker, offerId, companies, getEntriesForOffer]);

  const effectiveCompanyId = companyId || selectedCompanyId;
  const effectiveCompanyName =
    companyName || companies.find(c => c.id === selectedCompanyId)?.tradeName || '';

  const reset = () => {
    setTitle('');
    setDescription('');
    setType('capital');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    if (!companyId) setSelectedCompanyId('');
  };

  const handleSave = async () => {
    if (!effectiveCompanyId) {
      showError('Selecciona empresa', 'Elige una empresa para anclar el hito');
      return;
    }
    if (!title.trim()) return;
    setSaving(true);
    try {
      const milestone: Milestone = {
        id: crypto.randomUUID(),
        title: title.trim(),
        description: description.trim(),
        date,
        type,
      };
      await addMilestone(effectiveCompanyId, milestone);
      showSuccess('Hito registrado', `"${title}" guardado para ${effectiveCompanyName}`);
      reset();
      onClose();
    } catch {
      showError('Error', 'No se pudo guardar el hito');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {companyName ? `Nuevo hito · ${companyName}` : 'Nuevo hito'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {needsPicker && (
            <div>
              <Label className="text-xs">Empresa</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="mt-1 h-9 w-full justify-between text-xs font-normal"
                  >
                    {effectiveCompanyName || 'Selecciona empresa…'}
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar empresa…" className="h-9 text-xs" />
                    <CommandList>
                      <CommandEmpty>Sin resultados</CommandEmpty>
                      <CommandGroup>
                        {pickerCompanies.map(c => (
                          <CommandItem
                            key={c.id}
                            value={`${c.tradeName} ${c.legalName} ${c.nit}`}
                            onSelect={() => {
                              setSelectedCompanyId(c.id);
                              setPickerOpen(false);
                            }}
                            className="text-xs"
                          >
                            <Check className={cn('mr-2 h-3.5 w-3.5', selectedCompanyId === c.id ? 'opacity-100' : 'opacity-0')} />
                            <span className="truncate">{c.tradeName}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
          <div>
            <Label className="text-xs">Título</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Ganó convocatoria..." className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={type} onValueChange={v => setType(v as MilestoneType)}>
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MILESTONE_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 h-9 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Descripción (opcional)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="mt-1 text-xs" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={!title.trim() || !effectiveCompanyId || saving}>
              {saving ? 'Guardando…' : 'Guardar hito'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
