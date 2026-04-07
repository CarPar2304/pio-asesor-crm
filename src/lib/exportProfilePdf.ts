import { Company, GENDER_LABELS, ACTION_TYPE_LABELS, MILESTONE_TYPE_LABELS } from '@/types/crm';
import { calculateGrowth, formatCOP, formatPercentage, formatUSD, getLastYearSales } from '@/lib/calculations';
import { CustomField, CustomSection } from '@/types/crm';

export async function exportProfileToPdf(
  company: Company,
  sections: CustomSection[],
  fields: CustomField[],
) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  const colors = {
    primary: [30, 64, 175] as [number, number, number],
    muted: [100, 116, 139] as [number, number, number],
    dark: [15, 23, 42] as [number, number, number],
    success: [22, 163, 74] as [number, number, number],
    destructive: [220, 38, 38] as [number, number, number],
    border: [226, 232, 240] as [number, number, number],
    bgLight: [248, 250, 252] as [number, number, number],
  };

  function checkPage(needed: number) {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function drawSectionTitle(title: string) {
    checkPage(12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.muted);
    doc.text(title.toUpperCase(), margin, y);
    y += 2;
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageW - margin, y);
    y += 5;
  }

  function drawKeyValue(key: string, value: string, x: number, w: number) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.muted);
    doc.text(key, x, y);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.dark);
    const lines = doc.splitTextToSize(value || '—', w - 2);
    doc.text(lines, x, y + 4);
    return 4 + lines.length * 3.5;
  }

  // === HEADER ===
  // Company logo or initial circle
  let logoLoaded = false;
  if (company.logo) {
    try {
      const img = await loadImage(company.logo);
      doc.addImage(img, 'PNG', margin, y, 16, 16);
      logoLoaded = true;
    } catch (_) {
      // fallback to initial circle
    }
  }
  if (!logoLoaded) {
    doc.setFillColor(...colors.primary);
    doc.circle(margin + 8, y + 8, 8, 'F');
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(company.tradeName.charAt(0).toUpperCase(), margin + 8, y + 11, { align: 'center' });
  }

  // Company name
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.dark);
  doc.text(company.tradeName, margin + 20, y + 6);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...colors.muted);
  doc.text(company.legalName, margin + 20, y + 12);

  doc.setFontSize(8);
  doc.text(`NIT: ${company.nit || '—'}`, margin + 20, y + 17);

  // Badges
  const badges = [company.category, company.vertical, company.city].filter(Boolean);
  let bx = margin + 20;
  doc.setFontSize(7);
  badges.forEach(b => {
    const tw = doc.getTextWidth(b) + 4;
    doc.setFillColor(...colors.bgLight);
    doc.setDrawColor(...colors.border);
    doc.roundedRect(bx, y + 19, tw, 5, 1, 1, 'FD');
    doc.setTextColor(...colors.dark);
    doc.text(b, bx + 2, y + 22.5);
    bx += tw + 2;
  });

  y += 30;

  if (company.description) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.muted);
    const descLines = doc.splitTextToSize(company.description, contentW);
    checkPage(descLines.length * 3.5);
    doc.text(descLines, margin, y);
    y += descLines.length * 3.5 + 3;
  }

  // === KEY METRICS ===
  drawSectionTitle('Métricas clave');
  const { avgYoY, lastYoY } = calculateGrowth(company.salesByYear);
  const lastSales = getLastYearSales(company.salesByYear);
  const metricW = contentW / 4;

  checkPage(14);
  const metrics = [
    { label: lastSales ? `Ventas ${lastSales.year}` : 'Ventas', value: lastSales ? formatCOP(lastSales.value) : '—' },
    { label: 'Avg YoY', value: formatPercentage(avgYoY) },
    { label: 'Último YoY', value: formatPercentage(lastYoY) },
    { label: 'Exportaciones', value: company.exportsUSD > 0 ? formatUSD(company.exportsUSD) : '—' },
  ];

  metrics.forEach((m, i) => {
    const mx = margin + i * metricW;
    doc.setFillColor(...colors.bgLight);
    doc.setDrawColor(...colors.border);
    doc.roundedRect(mx, y, metricW - 2, 12, 1, 1, 'FD');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.muted);
    doc.text(m.label, mx + 2, y + 4);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.dark);
    doc.text(m.value, mx + 2, y + 9.5);
  });
  y += 16;

  // === SALES BY YEAR TABLE ===
  const salesYears = Object.keys(company.salesByYear).map(Number).sort();
  if (salesYears.length > 0) {
    drawSectionTitle('Ventas por año');
    const colW = contentW / 3;
    checkPage(8);

    // Header
    doc.setFillColor(...colors.primary);
    doc.rect(margin, y, contentW, 6, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Año', margin + 2, y + 4);
    doc.text('Ventas (COP)', margin + colW + 2, y + 4);
    doc.text('Crecimiento YoY', margin + colW * 2 + 2, y + 4);
    y += 6;

    salesYears.forEach((year, i) => {
      checkPage(6);
      let yoy: number | null = null;
      if (i > 0) {
        const prev = company.salesByYear[salesYears[i - 1]];
        if (prev > 0) yoy = ((company.salesByYear[year] - prev) / prev) * 100;
      }

      if (i % 2 === 0) {
        doc.setFillColor(...colors.bgLight);
        doc.rect(margin, y, contentW, 5.5, 'F');
      }

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...colors.dark);
      doc.text(String(year), margin + 2, y + 4);
      doc.text(formatCOP(company.salesByYear[year]), margin + colW + 2, y + 4);

      if (yoy !== null) {
        doc.setTextColor(...(yoy > 0 ? colors.success : colors.destructive));
        doc.text(formatPercentage(yoy), margin + colW * 2 + 2, y + 4);
      } else {
        doc.setTextColor(...colors.muted);
        doc.text('—', margin + colW * 2 + 2, y + 4);
      }
      y += 5.5;
    });
    y += 4;
  }

  // === CONTACTS ===
  if (company.contacts.length > 0) {
    drawSectionTitle('Contactos');
    company.contacts.forEach(c => {
      checkPage(18);
      doc.setFillColor(...colors.bgLight);
      doc.setDrawColor(...colors.border);
      doc.roundedRect(margin, y, contentW, 14, 1, 1, 'FD');

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colors.dark);
      doc.text(`${c.name}${c.isPrimary ? ' ★' : ''}`, margin + 3, y + 5);

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...colors.muted);
      const info = [c.position, c.gender && GENDER_LABELS[c.gender]].filter(Boolean).join(' · ');
      doc.text(info, margin + 3, y + 9);

      const contactDetails = [c.email, c.phone].filter(Boolean).join('  |  ');
      doc.text(contactDetails, margin + 3, y + 12.5);
      y += 17;
    });
    y += 2;
  }

  // === CUSTOM FIELDS ===
  const getFieldValueDisplay = (fieldId: string): string | null => {
    const val = (company.fieldValues || []).find(v => v.fieldId === fieldId);
    if (!val) return null;
    const field = fields.find(f => f.id === fieldId);
    if (!field) return null;
    if (field.fieldType === 'metric_by_year') {
      const entries = Object.entries(val.yearValues || {}).filter(([_, v]) => v > 0);
      if (entries.length === 0) return null;
      return entries.sort(([a], [b]) => Number(a) - Number(b)).map(([yr, v]) => `${yr}: ${formatCOP(v as number)}`).join(' · ');
    }
    if (field.fieldType === 'number') return val.numberValue !== null ? String(val.numberValue) : null;
    return val.textValue || null;
  };

  const unsectionedFields = fields.filter(f => !f.sectionId);
  const hasUnsectioned = unsectionedFields.some(f => getFieldValueDisplay(f.id));

  if (hasUnsectioned) {
    drawSectionTitle('Campos personalizados');
    const halfW = contentW / 2 - 1;
    let col = 0;
    unsectionedFields.forEach(f => {
      const display = getFieldValueDisplay(f.id);
      if (!display) return;
      if (col === 0) checkPage(12);
      const cx = margin + col * (halfW + 2);
      const h = drawKeyValue(f.name, display, cx + 2, halfW);
      if (col === 1) { y += Math.max(h, 8) + 2; col = 0; } else { col = 1; }
    });
    if (col === 1) y += 10;
    y += 2;
  }

  sections.forEach(section => {
    const sectionFields = fields.filter(f => f.sectionId === section.id);
    const hasData = sectionFields.some(f => getFieldValueDisplay(f.id));
    if (!hasData) return;

    drawSectionTitle(section.name);
    const halfW = contentW / 2 - 1;
    let col = 0;
    sectionFields.forEach(f => {
      const display = getFieldValueDisplay(f.id);
      if (!display) return;
      if (col === 0) checkPage(12);
      const cx = margin + col * (halfW + 2);
      const h = drawKeyValue(f.name, display, cx + 2, halfW);
      if (col === 1) { y += Math.max(h, 8) + 2; col = 0; } else { col = 1; }
    });
    if (col === 1) y += 10;
    y += 2;
  });

  // === ACTIVITY (recent actions, milestones, tasks) ===
  const recentActions = [...company.actions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
  if (recentActions.length > 0) {
    drawSectionTitle('Acciones recientes');
    recentActions.forEach(a => {
      checkPage(8);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...colors.muted);
      doc.text(new Date(a.date).toLocaleDateString('es-CO'), margin, y + 3);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colors.dark);
      doc.text(ACTION_TYPE_LABELS[a.type] || a.type, margin + 22, y + 3);

      doc.setFont('helvetica', 'normal');
      const descLines = doc.splitTextToSize(a.description, contentW - 55);
      doc.text(descLines, margin + 45, y + 3);
      y += Math.max(5, descLines.length * 3.5) + 1;
    });
    y += 2;
  }

  const recentMilestones = [...company.milestones].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
  if (recentMilestones.length > 0) {
    drawSectionTitle('Hitos');
    recentMilestones.forEach(m => {
      checkPage(8);
      doc.setFontSize(7);
      doc.setTextColor(...colors.muted);
      doc.text(new Date(m.date).toLocaleDateString('es-CO'), margin, y + 3);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colors.dark);
      doc.text(`${MILESTONE_TYPE_LABELS[m.type] || m.type}: ${m.title}`, margin + 22, y + 3);
      y += 6;
    });
    y += 2;
  }

  const pendingTasks = company.tasks.filter(t => t.status === 'pending');
  if (pendingTasks.length > 0) {
    drawSectionTitle('Tareas pendientes');
    pendingTasks.forEach(t => {
      checkPage(8);
      doc.setFontSize(7);
      doc.setTextColor(...colors.muted);
      doc.text(new Date(t.dueDate).toLocaleDateString('es-CO'), margin, y + 3);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...colors.dark);
      doc.text(t.title, margin + 22, y + 3);
      y += 6;
    });
    y += 2;
  }

  // === FOOTER ===
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.muted);
    doc.text(`${company.tradeName} — Perfil exportado el ${new Date().toLocaleDateString('es-CO')}`, margin, pageH - 8);
    doc.text(`Página ${i} de ${totalPages}`, pageW - margin, pageH - 8, { align: 'right' });
  }

  doc.save(`${company.tradeName.replace(/[^a-zA-Z0-9]/g, '_')}_perfil.pdf`);
}
