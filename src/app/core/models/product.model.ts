export interface Product {
  id: string;
  name: string;
  categoryId: string;
  categoryName?: string;
  price: number;
  unit: string;
  imageUrl: string;
  stock: number;
  inStock: boolean;
  createdAt?: string;
  updatedAt?: string;
}

