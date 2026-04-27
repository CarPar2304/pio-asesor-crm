// Helpers to evaluate dynamic form fields (operation type) on the client.
// Generation fields are NEVER evaluated client-side; the edge function does it on submit.

import type { DynamicConfig } from '@/types/externalForms';

const toNumber = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

export function evaluateOperation(
  config: DynamicConfig,
  values: Record<string, any>,
): number | null {
  try {
    if (config.mode === 'formula' && config.formula) {
      // Replace {field_key} tokens with numeric values
      const expr = config.formula.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key) => {
        return String(toNumber(values[key]));
      });
      // Strict whitelist: digits, operators, parens, dot, spaces
      if (!/^[\d+\-*/().,\s]+$/.test(expr)) return null;
      // eslint-disable-next-line no-new-func
      const fn = new Function(`"use strict"; return (${expr.replace(/,/g, '.')});`);
      const r = fn();
      return typeof r === 'number' && isFinite(r) ? r : null;
    }
    // simple
    const a = toNumber(values[config.input_a || '']);
    const b = toNumber(values[config.input_b || '']);
    switch (config.op) {
      case 'add': return a + b;
      case 'subtract': return a - b;
      case 'multiply': return a * b;
      case 'divide': return b === 0 ? null : a / b;
      case 'percentage': return (a * b) / 100; // a × b%
      default: return null;
    }
  } catch {
    return null;
  }
}

export function formatDynamicResult(
  value: number | null,
  config: DynamicConfig,
): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const decimals = typeof config.decimals === 'number' ? config.decimals : 2;
  const formatted = value.toLocaleString('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return config.suffix ? `${formatted} ${config.suffix}` : formatted;
}

export function getOperationInputKeys(config: DynamicConfig): string[] {
  if (config.mode === 'formula' && config.formula) {
    const matches = Array.from(config.formula.matchAll(/\{([a-zA-Z0-9_]+)\}/g));
    return Array.from(new Set(matches.map(m => m[1])));
  }
  return [config.input_a, config.input_b].filter(Boolean) as string[];
}
