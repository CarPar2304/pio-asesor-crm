export interface OfferCategory {
  id: string;
  name: string;
  color: string;
  displayOrder: number;
  createdAt: string;
}

export interface OfferType {
  id: string;
  name: string;
  createdAt: string;
}

export type OfferStatus = 'active' | 'inactive' | 'draft';

export interface PortfolioOffer {
  id: string;
  name: string;
  description: string;
  product: string;
  type: string; // now a free string matching OfferType.name
  categoryId: string | null;
  category?: OfferCategory;
  startDate: string | null;
  endDate: string | null;
  status: OfferStatus;
  createdAt: string;
  updatedAt: string;
  stages?: PipelineStage[];
}

export const PRODUCT_OPTIONS = ['Innovación', 'Inversión', 'Internacionalización', 'Otro'] as const;

export interface PipelineStage {
  id: string;
  offerId: string;
  name: string;
  color: string;
  icon: string;
  displayOrder: number;
  createdAt: string;
  entries?: PipelineEntry[];
}

export interface PipelineEntry {
  id: string;
  offerId: string;
  stageId: string;
  companyId: string;
  notes: string;
  createdAt: string;
}

export const STAGE_ICONS = [
  'Circle', 'CheckCircle', 'Clock', 'Star', 'Zap', 'Target', 'Flag',
  'Rocket', 'Trophy', 'Award', 'Flame', 'Lightbulb', 'Heart', 'ThumbsUp',
  'MessageSquare', 'Phone', 'Mail', 'Calendar', 'Users', 'Building2',
] as const;

export const STAGE_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#84cc16',
  '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6',
  '#64748b', '#374151',
] as const;
