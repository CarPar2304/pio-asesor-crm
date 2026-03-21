import { useState } from 'react';
import FieldSelectorDialog, { FieldOption } from './FieldSelectorDialog';
import { Company } from '@/types/crm';
import { useCustomFields } from '@/contexts/CustomFieldsContext';
import { calculateGrowth } from '@/lib/calculations';
import * as XLSX from 'xlsx';

interface Props {
  open: boolean;
  onClose: () => void;
  companies: Company[];
  activeYear: number;
}

export default function ExportDialog({ open, onClose, companies, activeYear }: Props) {
  const { fields } = useCustomFields();

  const handleExport = (selectedFields: FieldOption[]) => {
    const rows = companies.map(company => {
      const primaryContact = company.contacts.find(c => c.isPrimary) || company.contacts[0];
      const { avgYoY, lastYoY } = calculateGrowth(company.salesByYear);
      const row: Record<string, any> = {};

      selectedFields.forEach(field => {
        switch (field.id) {
          case 'tradeName': row[field.label] = company.tradeName; break;
          case 'legalName': row[field.label] = company.legalName; break;
          case 'nit': row[field.label] = company.nit; break;
          case 'category': row[field.label] = company.category; break;
          case 'vertical': row[field.label] = company.vertical; break;
          case 'economicActivity': row[field.label] = company.economicActivity; break;
          case 'description': row[field.label] = company.description; break;
          case 'city': row[field.label] = company.city; break;
          case 'website': row[field.label] = company.website; break;
          case 'exportsUSD': row[field.label] = Number(company.exportsUSD) || 0; break;
          case 'contactName': row[field.label] = primaryContact?.name || ''; break;
          case 'contactPosition': row[field.label] = primaryContact?.position || ''; break;
          case 'contactEmail': row[field.label] = primaryContact?.email || ''; break;
          case 'contactPhone': row[field.label] = primaryContact?.phone || ''; break;
          case 'contactGender': row[field.label] = primaryContact?.gender || ''; break;
          default:
            if (field.type === 'sales_year' && field.year) {
              row[field.label] = Number(company.salesByYear[field.year]) || 0;
            } else if (field.type === 'custom' && field.fieldId) {
              const val = company.fieldValues.find(v => v.fieldId === field.fieldId);
              if (field.year) {
                row[field.label] = Number(val?.yearValues?.[field.year]) || 0;
              } else {
                const fieldDef = fields.find(f => f.id === field.fieldId);
                if (fieldDef?.fieldType === 'number') {
                  row[field.label] = Number(val?.numberValue) || 0;
                } else {
                  row[field.label] = val?.textValue || '';
                }
              }
            }
        }
      });

      return row;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = selectedFields.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Empresas');
    XLSX.writeFile(wb, `empresas-export-${activeYear}.xlsx`);
  };

  return (
    <FieldSelectorDialog
      open={open}
      onClose={onClose}
      onConfirm={handleExport}
      title="Exportar empresas"
      confirmLabel="Exportar"
    />
  );
}
