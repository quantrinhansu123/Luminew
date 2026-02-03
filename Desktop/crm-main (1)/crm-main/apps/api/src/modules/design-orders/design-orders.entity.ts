export enum DesignOrderStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  REVIEW = 'REVIEW',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
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
  createdAt: string;
  updatedAt?: string;
}
