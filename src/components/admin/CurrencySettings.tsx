import { useState } from 'react';
import { useProfile, SalesCurrencyConfig } from '@/contexts/ProfileContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showSuccess } from '@/lib/toast';
import { formatSales } from '@/lib/calculations';
import { Save, DollarSign } from 'lucide-react';

const CURRENCIES: { code: string; symbol: string; locale: string; label: string }[] = [
  { code: 'COP', symbol: '$', locale: 'es-CO', label: 'Peso colombiano (COP)' },
  { code: 'USD', symbol: '$', locale: 'en-US', label: 'Dólar estadounidense (USD)' },
  { code: 'EUR', symbol: '€', locale: 'de-DE', label: 'Euro (EUR)' },
  { code: 'MXN', symbol: '$', locale: 'es-MX', label: 'Peso mexicano (MXN)' },
  { code: 'BRL', symbol: 'R$', locale: 'pt-BR', label: 'Real brasileño (BRL)' },
];

export default function CurrencySettings() {
  const { salesCurrency, updateSalesCurrency, isAdmin } = useProfile();
  const [selected, setSelected] = useState(salesCurrency.code);
  const [saving, setSaving] = useState(false);

  const selectedCurrency = CURRENCIES.find(c => c.code === selected) || CURRENCIES[0];

  const handleSave = async () => {
    setSaving(true);
    const config: SalesCurrencyConfig = {
      code: selectedCurrency.code,
      symbol: selectedCurrency.symbol,
      locale: selectedCurrency.locale,
    };
    await updateSalesCurrency(config);
    showSuccess('Moneda actualizada', `La moneda principal ahora es ${selectedCurrency.label}`);
    setSaving(false);
  };

  if (!isAdmin) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-6">
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-sm font-semibold">Moneda principal de ventas</h2>
          <p className="text-xs text-muted-foreground">Define la moneda por defecto para mostrar las ventas en el CRM</p>
        </div>
      </div>

      <div className="max-w-xs space-y-3">
        <div>
          <Label className="text-xs">Moneda</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => (
                <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Preview del formato</p>
          <p className="font-mono text-sm">{formatSales(1500000000, selectedCurrency.code)}</p>
          <p className="font-mono text-sm">{formatSales(250000000, selectedCurrency.code)}</p>
          <p className="font-mono text-sm">{formatSales(5000000, selectedCurrency.code)}</p>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving || selected === salesCurrency.code} size="sm" className="gap-1.5">
        <Save className="h-3.5 w-3.5" /> Guardar
      </Button>
    </div>
  );
}
