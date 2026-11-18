export interface Product {
  id: string;
  code?: string;
  name: string;
  product?: string;
  categoryId: string;
  categoryName?: string;
  category?: string;
  details?: string;
  unit: string;
  mrp?: number;
  sellingPrice?: number;
  discountPrice?: number;
  discountPercentage?: number;
  price: number;
  stock: number;
  imageUrl: string;
  productImage?: string | null;
  isFeatured?: boolean;
  isActive?: boolean;
  inStock: boolean;
  offerType?: 'AMOUNT' | 'PERCENT' | string | null;
  offerValue?: number | null;
  offerAmount?: number | null;
  offerPercentage?: number | null;
  variants?: Product[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AddProductPayload {
  productName: string;
  mrp: number;
  categoryId?: number | string | null;
  categoryName?: string | null;
  description?: string | null;
  unit?: string;
  sellingPrice?: number | null;
  stock?: number;
  productImage?: string | null;
  isFeatured?: boolean | number;
  code?: string | null;
  offerType?: 'PERCENT' | 'AMOUNT' | string | null;
  offerValue?: number | null;
  offerStartDate?: string | null;
  offerEndDate?: string | null;
  groupId?: number | null;
}

export interface UpdateProductPayload {
  id: number | string;
  productName: string;
  mrp: number;
  categoryId?: number | string | null;
  categoryName?: string | null;
  description?: string | null;
  unit?: string | null;
  sellingPrice?: number | null;
  stock?: number | null;
  productImage?: string | null;
  isFeatured?: boolean | number | null;
  isActive?: boolean | number | null;
  offerType?: 'PERCENT' | 'AMOUNT' | string | null;
  offerValue?: number | null;
  offerStartDate?: string | null;
  offerEndDate?: string | null;
}

export interface UpdateStockPayload {
  id: number | string;
  quantity?: number | null;
  delta?: number | null;
}

export interface UpdateStockResponse {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  updatedAt: string;
}

export interface DeleteProductResponse {
  success: boolean;
  deleteType: 'HARD' | 'SOFT';
  message: string;
}

