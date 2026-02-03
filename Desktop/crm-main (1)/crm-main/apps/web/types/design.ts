export enum DesignOrderStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  REVIEW = 'REVIEW',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export interface UploadedFile {
  url: string;
  fileName: string;
  originalName: string;
  size: number;
  uploadedAt: string;
}

export interface DesignOrder {
  id: string;
  customerName: string;
  phone: string;
  productType: string;
  requirements: string;
  designer: string;
  status: DesignOrderStatus;
  revenue: number;
  deadline: string;
  fileUrls?: UploadedFile[];
  imageUrl?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface DesignTemplate {
  id: string;
  name: string;
  description?: string;
  type: string; // bag, box, card, label
  category?: string;
  tags: string[];
  thumbnailUrl?: string;
  fileUrls?: UploadedFile[];
  dimensions?: Record<string, any>;
  paperWeight?: number;
  customerName?: string;
  customerPhone?: string;
  sourceOrderId?: string;
  notes?: string;
  isPublic: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}
