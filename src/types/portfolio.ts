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

export interface Ally {
  id: string;
  name: string;
  logo: string | null;
  createdAt: string;
  contacts?: AllyContact[];
}

export interface AllyContact {
  id: string;
  allyId: string;
  name: string;
  position: string;
  email: string;
  phone: string;
  notes: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface OfferAlly {
  id: string;
  offerId: string;
  allyId: string;
  createdAt: string;
}

export interface PortfolioOffer {
  id: string;
  name: string;
  description: string;
  product: string;
  type: string;
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
  addedBy: string | null;
  createdAt: string;
}

export const STAGE_ICONS = [
  'Circle', 'CheckCircle', 'CheckCircle2', 'Clock', 'Star', 'Zap', 'Target', 'Flag',
  'Rocket', 'Trophy', 'Award', 'Flame', 'Lightbulb', 'Heart', 'ThumbsUp',
  'MessageSquare', 'Phone', 'Mail', 'Calendar', 'Users', 'Building2',
  'Send', 'ArrowRight', 'ArrowUpRight', 'TrendingUp', 'BarChart3', 'PieChart',
  'Shield', 'ShieldCheck', 'Lock', 'Unlock', 'Key', 'Eye', 'EyeOff',
  'Bell', 'BellRing', 'Bookmark', 'BookOpen', 'Briefcase', 'Clipboard',
  'ClipboardCheck', 'ClipboardList', 'Code', 'Cog', 'Settings',
  'Database', 'FileText', 'File', 'FolderOpen', 'Globe', 'GraduationCap',
  'Handshake', 'Hash', 'Headphones', 'Home', 'Image', 'Inbox',
  'Layers', 'Layout', 'Link', 'List', 'MapPin', 'Megaphone',
  'Mic', 'Monitor', 'Package', 'Paperclip', 'PenTool', 'Percent',
  'Plug', 'Power', 'RefreshCw', 'Repeat', 'Save', 'Search', 'Server',
  'Share2', 'ShoppingBag', 'ShoppingCart', 'Smartphone', 'Smile',
  'Tag', 'Terminal', 'Timer', 'Tool', 'Truck', 'Upload',
  'UserCheck', 'UserPlus', 'Video', 'Wallet', 'Watch', 'Wifi', 'Wrench',
  'Sparkles', 'Crown', 'Gem', 'Gift', 'Puzzle',
  'CircleDot', 'AlertCircle', 'AlertTriangle', 'Info',
  'HelpCircle', 'MinusCircle', 'PlusCircle', 'ArrowRightCircle',
] as const;

export const STAGE_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#84cc16',
  '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6',
  '#64748b', '#374151',
] as const;
