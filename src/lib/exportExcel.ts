import * as XLSX from 'xlsx';
import { Company } from '@/types/crm';
import { calculateGrowth } from '@/lib/calculations';

function getSalesYears(companies: Company[]) {
  return Array.from(
    new Set(
      companies.flatMap((company) => Object.keys(company.salesByYear).map(Number))
    )
  ).sort((a, b) => a - b);
}

export function exportCompaniesToExcel(companies: Company[], activeYear: number) {
  const years = getSalesYears(companies);

  const rows = companies.map((company) => {
    const primaryContact = company.contacts.find((contact) => contact.isPrimary);
    const { avgYoY, lastYoY } = calculateGrowth(company.salesByYear);

    const baseRow: Record<string, string | number> = {
      'Nombre comercial': company.tradeName,
      'Razón social': company.legalName,
      NIT: company.nit,
      Categoría: company.category,
      Vertical: company.vertical,
      Ciudad: company.city,
      'Actividad económica': company.economicActivity,
      Sitio: company.website,
      Descripción: company.description,
      'Exportaciones USD': Number(company.exportsUSD) || 0,
      'Ventas año activo (COP)': company.salesByYear[activeYear] || 0,
      'Promedio YoY %': avgYoY !== null ? Number(avgYoY.toFixed(2)) : '',
      'Último YoY %': lastYoY !== null ? Number(lastYoY.toFixed(2)) : '',
      'Contacto principal': primaryContact?.name || '',
      'Cargo contacto': primaryContact?.position || '',
      'Email contacto': primaryContact?.email || '',
      'Teléfono contacto': primaryContact?.phone || '',
      'Género contacto': primaryContact?.gender || '',
    };

    years.forEach((year) => {
      baseRow[`Ventas ${year} (COP)`] = company.salesByYear[year] || 0;
    });

    return baseRow;
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Empresas');
  XLSX.writeFile(workbook, `empresas-filtradas-${activeYear}.xlsx`);
}
