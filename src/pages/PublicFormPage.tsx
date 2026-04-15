import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, AlertCircle, ShieldCheck, FlaskConical, Upload, X } from 'lucide-react';
import logoCCC from '@/assets/logo-ccc.png';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function callFormApi(action: string, body?: any, params?: Record<string, string>) {
  const queryParams = new URLSearchParams({ action, ...params });
  const opts: RequestInit = {
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  };
  if (body) {
    opts.method = 'POST';
    opts.body = JSON.stringify(body);
  } else {
    opts.method = 'GET';
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/form-verify?${queryParams}`, opts);
  return res.json();
}

type Step = 'identify' | 'code' | 'form' | 'success' | 'error';

function FileUploadField({ value, onChange, placeholder }: { value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/') && file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleFile(file);
        break;
      }
    }
  }, []);

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  if (value) {
    return (
      <div className="relative inline-block">
        <img src={value} alt="Preview" className="h-20 rounded-md border object-contain" />
        <button onClick={() => onChange(null)} className="absolute -top-2 -right-2 bg-background border rounded-full p-0.5">
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div ref={dropRef}
      className="border-2 border-dashed rounded-md p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}>
      <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{placeholder || 'Arrastra, haz clic o pega con Ctrl+V'}</p>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}

function SalesByYearField({ value, onChange, currencyKey, onCurrencyChange }: { value: Record<string, number> | null; onChange: (v: Record<string, number>) => void; currencyKey?: string; onCurrencyChange?: (c: string) => void }) {
  const currentYear = new Date().getFullYear();
  const data = value || {};
  const years = Object.keys(data).map(Number).sort();
  const allYears = years.length > 0 ? years : [currentYear - 2, currentYear - 1];
  const minYear = Math.min(...allYears, currentYear - 2);
  const maxYear = Math.max(...allYears, currentYear - 1);
  const displayYears: number[] = [];
  for (let y = minYear; y <= maxYear; y++) displayYears.push(y);

  const addYear = () => {
    const next = displayYears.length > 0 ? Math.max(...displayYears) + 1 : currentYear;
    onChange({ ...data, [next]: 0 });
  };

  const cur = currencyKey || 'COP';
  const formatPreview = (n: number) => {
    const locale = cur === 'USD' ? 'en-US' : 'es-CO';
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
  };

  return (
    <div className="space-y-2">
      {onCurrencyChange && (
        <div className="flex items-center gap-2 mb-1">
          <Label className="text-xs text-muted-foreground">Moneda:</Label>
          <Select value={cur} onValueChange={v => onCurrencyChange(v)}>
            <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="COP">COP</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {displayYears.map(year => (
        <div key={year} className="flex items-center gap-2">
          <span className="text-xs font-medium w-12 text-right">{year}</span>
          <Input
            type="number"
            className="flex-1"
            placeholder="0"
            value={data[year] || ''}
            onChange={e => {
              const v = e.target.value ? Number(e.target.value) : 0;
              onChange({ ...data, [year]: v });
            }}
          />
          {data[year] > 0 && <span className="text-[10px] text-muted-foreground w-28 truncate">{formatPreview(data[year])}</span>}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addYear}>
        + Agregar año
      </Button>
    </div>
  );
}

export default function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const isTestMode = searchParams.get('test') === 'true';
  const testEmail = searchParams.get('test_email') || '';
  const [step, setStep] = useState<Step>('identify');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Identify
  const [keyValue, setKeyValue] = useState('');
  const [useNameFallback, setUseNameFallback] = useState(false);
  const [sessionToken, setSessionToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [requiresCode, setRequiresCode] = useState(false);

  // Code
  const [code, setCode] = useState('');

  // Form
  const [form, setForm] = useState<any>(null);
  const [fields, setFields] = useState<any[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isNewCompany, setIsNewCompany] = useState(false);

  // Check if creation form (skip identification)
  const [formMeta, setFormMeta] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const params: Record<string, string> = { slug: slug! };
        if (isTestMode) params.test_mode = 'true';
        const data = await callFormApi('load-form', undefined, params);
        if (data.form) {
          setFormMeta(data.form);
          if (data.form.form_type === 'creation' && data.form.verification_mode === 'none') {
            setForm(data.form);
            setFields(data.fields || []);
            setFormData(data.preloaded_data || {});
            setStep('form');
          }
        }
      } catch {}
    })();
  }, [slug, isTestMode]);

  const handleIdentify = async () => {
    if (!keyValue.trim()) { setErrorMsg(useNameFallback ? 'Ingresa el nombre de la empresa' : 'Ingresa el NIT'); return; }
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await callFormApi('identify', {
        form_id: formMeta?.id,
        key_value: keyValue.trim(),
        use_name_fallback: useNameFallback,
        ip_address: '',
        test_mode: isTestMode,
        test_email: isTestMode ? testEmail : undefined
      });
      if (data.error) { setErrorMsg(data.error); setLoading(false); return; }

      setSessionToken(data.session_token);
      if (data.requires_code) {
        setRequiresCode(true);
        setMaskedEmail(data.masked_email);
        setCompanyName(data.company_name);
        setStep('code');
      } else {
        await loadForm(data.session_token);
      }
    } catch (e: any) {
      setErrorMsg('Error de conexión');
    }
    setLoading(false);
  };

  const handleVerifyCode = async () => {
    if (!code.trim()) { setErrorMsg('Ingresa el código'); return; }
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await callFormApi('verify-code', { session_token: sessionToken, code: code.trim() });
      if (data.error) { setErrorMsg(data.error); setLoading(false); return; }
      await loadForm(sessionToken);
    } catch {
      setErrorMsg('Error de conexión');
    }
    setLoading(false);
  };

  const loadForm = async (token: string) => {
    const params: Record<string, string> = { session_token: token };
    if (isTestMode) params.test_mode = 'true';
    const data = await callFormApi('load-form', undefined, params);
    if (data.error) { setErrorMsg(data.error); return; }
    setForm(data.form);
    setFields(data.fields || []);
    setFormData(data.preloaded_data || {});
    setIsNewCompany(data.is_new_company || false);
    setStep('form');
  };

  const handleSubmit = async () => {
    // Validate required fields (only visible ones considering conditions)
    for (const field of fields) {
      if (field.is_required && isFieldVisible(field) && !formData[field.field_key]?.toString().trim()) {
        setErrorMsg(`El campo "${field.label}" es obligatorio`);
        return;
      }
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const data = await callFormApi('submit', {
        session_token: sessionToken || undefined,
        form_id: form.id,
        response_data: formData,
        test_mode: isTestMode
      });
      if (data.error) { setErrorMsg(data.error); setLoading(false); return; }
      setStep('success');
    } catch {
      setErrorMsg('Error de conexión');
    }
    setLoading(false);
  };

  const updateFormData = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  // Check if a field should be visible based on conditional logic
  const isFieldVisible = (field: any) => {
    if (!field.is_visible) return false;
    if (!field.condition_field_key) return true;
    const sourceValue = formData[field.condition_field_key];
    if (field.condition_value === 'true') return !!sourceValue;
    if (field.condition_value === 'false') return !sourceValue;
    return String(sourceValue || '') === String(field.condition_value || '');
  };

  const primaryColor = form?.primary_color || formMeta?.primary_color || '#4f46e5';

  // Group fields by section (only visible ones)
  const sections = fields.reduce((acc: Record<string, any[]>, field) => {
    const section = field.section_name || 'General';
    if (!acc[section]) acc[section] = [];
    if (isFieldVisible(field)) acc[section].push(field);
    return acc;
  }, {});

  // Filter out empty sections
  const nonEmptySections = Object.entries(sections).filter(([, f]) => (f as any[]).length > 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      {isTestMode && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-center py-1.5 text-sm font-medium flex items-center justify-center gap-2">
          <FlaskConical className="h-4 w-4" />
          Modo prueba — El código de verificación se enviará a: {testEmail}
        </div>
      )}
      <Card className={`w-full max-w-lg shadow-lg ${isTestMode ? 'mt-10' : ''}`}>
        {/* Identify step */}
        {step === 'identify' && (
          <>
            <CardHeader className="text-center">
              <img src={logoCCC} alt="Cámara de Comercio de Cali" className="h-12 mx-auto mb-2 object-contain" />
              <CardTitle className="text-lg">{formMeta?.public_title || 'Verificación de identidad'}</CardTitle>
              <CardDescription>{formMeta?.public_subtitle || (useNameFallback ? 'Ingresa el nombre de tu empresa para continuar' : formMeta?.verification_key_field === 'legal_name' ? 'Ingresa tu razón social para continuar' : 'Ingresa tu NIT para continuar')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {formMeta?.allow_name_fallback && formMeta?.verification_key_field === 'nit' && (
                <div className="flex items-center gap-2">
                  <Checkbox checked={useNameFallback} onCheckedChange={v => { setUseNameFallback(!!v); setKeyValue(''); setErrorMsg(''); }} id="no-nit" />
                  <label htmlFor="no-nit" className="text-sm cursor-pointer">No tengo NIT</label>
                </div>
              )}
              <div>
                <Label>{useNameFallback ? 'Razón social o Nombre comercial' : formMeta?.verification_key_field === 'legal_name' ? 'Razón social de la empresa' : 'NIT de la empresa'}</Label>
                <Input value={keyValue} onChange={e => setKeyValue(e.target.value)} 
                  placeholder={useNameFallback ? 'Ej: Mi Empresa S.A.S.' : formMeta?.verification_key_field === 'legal_name' ? 'Ej: Mi Empresa S.A.S.' : 'Ej: 900123456'}
                  onKeyDown={e => e.key === 'Enter' && handleIdentify()} />
              </div>
              {errorMsg && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {errorMsg}
                </div>
              )}
              <Button className="w-full" onClick={handleIdentify} disabled={loading}
                style={{ backgroundColor: primaryColor }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                Verificar
              </Button>
            </CardContent>
          </>
        )}

        {/* Code step */}
        {step === 'code' && (
          <>
            <CardHeader className="text-center">
              <img src={logoCCC} alt="Cámara de Comercio de Cali" className="h-12 mx-auto mb-2 object-contain" />
              <CardTitle className="text-lg">Código de verificación</CardTitle>
              <CardDescription>
                Hemos enviado un código de verificación a <strong>{maskedEmail}</strong>
                {companyName && <><br />Empresa: {companyName}</>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Código de 6 dígitos</Label>
                <Input value={code} onChange={e => setCode(e.target.value)} placeholder="123456" maxLength={6}
                  className="text-center text-2xl tracking-widest font-mono"
                  onKeyDown={e => e.key === 'Enter' && handleVerifyCode()} />
              </div>
              {errorMsg && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {errorMsg}
                </div>
              )}
              <Button className="w-full" onClick={handleVerifyCode} disabled={loading}
                style={{ backgroundColor: primaryColor }}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Verificar código
              </Button>
            </CardContent>
          </>
        )}

        {/* Form step */}
        {step === 'form' && form && (
          <>
            <CardHeader>
              <img src={logoCCC} alt="Cámara de Comercio de Cali" className="h-10 mb-2 object-contain" />
              <CardTitle className="text-lg">{form.public_title || form.name}</CardTitle>
              {form.public_subtitle && <CardDescription>{form.public_subtitle}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-6">
              {nonEmptySections.map(([sectionName, sectionFields]) => (
                <div key={sectionName}>
                  {nonEmptySections.length > 1 && (
                    <h3 className="text-sm font-semibold mb-3 text-foreground/80">{sectionName}</h3>
                  )}
                  <div className="space-y-3">
                    {(sectionFields as any[]).map((field: any) => (
                      <div key={field.id}>
                        <Label className="text-sm">
                          {field.label}
                          {field.is_required && <span className="text-red-500 ml-0.5">*</span>}
                        </Label>
                        {field.help_text && <p className="text-[11px] text-muted-foreground mb-1">{field.help_text}</p>}

                        {(() => {
                          const effectiveReadonly = field.is_readonly || (field.only_for_new && !isNewCompany);
                          return effectiveReadonly ? (
                            field.field_type === 'sales_by_year' ? (
                              <div className="rounded-md bg-muted px-3 py-2 text-sm space-y-1">
                                {Object.entries(formData[field.field_key] || {}).sort(([a],[b]) => Number(a) - Number(b)).map(([y, v]) => (
                                  <div key={y} className="flex justify-between"><span>{y}</span><span>{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v))}</span></div>
                                ))}
                                {(!formData[field.field_key] || Object.keys(formData[field.field_key]).length === 0) && <span>—</span>}
                              </div>
                            ) : field.field_type === 'file' && formData[field.field_key] ? (
                              <img src={formData[field.field_key]} alt="Logo" className="h-16 w-16 object-contain rounded-md border" />
                            ) : (
                              <div className="rounded-md bg-muted px-3 py-2 text-sm">{formData[field.field_key] || '—'}</div>
                            )
                          ) : field.field_type === 'sales_by_year' ? (
                            <SalesByYearField
                              value={formData[field.field_key] || null}
                              onChange={(val) => updateFormData(field.field_key, val)}
                              currencyKey={formData[`${field.field_key}_currency`] || 'COP'}
                              onCurrencyChange={(c) => updateFormData(`${field.field_key}_currency`, c)}
                            />
                          ) : field.field_type === 'long_text' ? (
                          <Textarea value={formData[field.field_key] || ''} onChange={e => updateFormData(field.field_key, e.target.value)}
                            placeholder={field.placeholder} rows={3} />
                        ) : field.field_type === 'select' ? (
                          <Select value={formData[field.field_key] || ''} onValueChange={v => updateFormData(field.field_key, v)}>
                            <SelectTrigger><SelectValue placeholder={field.placeholder || 'Seleccionar...'} /></SelectTrigger>
                            <SelectContent>
                              {(field.options || []).map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : field.field_type === 'checkbox' ? (
                          <div className="flex items-center gap-2">
                            <Checkbox checked={!!formData[field.field_key]}
                              onCheckedChange={v => updateFormData(field.field_key, !!v)} />
                            <span className="text-sm">{field.placeholder || 'Sí'}</span>
                          </div>
                        ) : field.field_type === 'file' ? (
                          <FileUploadField
                            value={formData[field.field_key] || null}
                            onChange={(val) => updateFormData(field.field_key, val)}
                            placeholder={field.placeholder}
                          />
                        ) : (
                          <Input
                            type={field.field_type === 'number' ? 'number' : field.field_type === 'email' ? 'email' : field.field_type === 'date' ? 'date' : field.field_type === 'url' ? 'url' : field.field_type === 'phone' ? 'tel' : 'text'}
                            value={formData[field.field_key] || ''}
                            onChange={e => updateFormData(field.field_key, e.target.value)}
                            placeholder={field.placeholder}
                          />
                        );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {errorMsg && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {errorMsg}
                </div>
              )}

              <Button className="w-full" onClick={handleSubmit} disabled={loading}
                style={{ backgroundColor: primaryColor }}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {form.submit_button_text || 'Enviar'}
              </Button>
            </CardContent>
          </>
        )}

        {/* Success step */}
        {step === 'success' && (
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-16 w-16 mx-auto mb-4" style={{ color: primaryColor }} />
            <h2 className="text-lg font-semibold mb-2">¡Enviado!</h2>
            <p className="text-sm text-muted-foreground">{form?.success_message || 'Tu información ha sido enviada exitosamente.'}</p>
          </CardContent>
        )}

        {/* Error step */}
        {step === 'error' && (
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-lg font-semibold mb-2">Error</h2>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
