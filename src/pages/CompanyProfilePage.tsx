import { useParams, useNavigate } from 'react-router-dom';
import { useCRM } from '@/contexts/CRMContext';
import CompanyProfile from '@/components/crm/CompanyProfile';

export default function CompanyProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getCompany } = useCRM();

  const company = id ? getCompany(id) : undefined;

  if (!company) {
    return (
      <div className="container flex flex-col items-center justify-center py-20">
        <p className="text-lg font-medium text-muted-foreground">Empresa no encontrada</p>
        <button className="mt-2 text-sm text-accent underline" onClick={() => navigate('/')}>
          Volver al CRM
        </button>
      </div>
    );
  }

  return <CompanyProfile company={company} onBack={() => navigate('/')} />;
}
