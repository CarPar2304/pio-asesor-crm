import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ExternalForm } from '@/types/externalForms';
import FormWizardDialog from '@/components/forms/FormWizardDialog';
import { showError } from '@/lib/toast';

export default function FormEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [editingForm, setEditingForm] = useState<ExternalForm | null>(null);
  const [loading, setLoading] = useState(!!id);

  useEffect(() => {
    if (!id) {
      setEditingForm(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase.from('external_forms').select('*').eq('id', id).maybeSingle().then(({ data, error }) => {
      if (error) showError('Error', error.message);
      setEditingForm((data as any) || null);
      setLoading(false);
    });
  }, [id]);

  const handleClose = () => navigate('/formularios');
  const handleSaved = () => { /* keep on page so user can keep editing */ };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Cargando formulario…</div>
      </div>
    );
  }

  return (
    <FormWizardDialog
      open={true}
      onClose={handleClose}
      editingForm={editingForm}
      onSaved={handleSaved}
    />
  );
}
