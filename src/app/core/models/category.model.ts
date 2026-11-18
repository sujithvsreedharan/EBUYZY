export interface Category {
  id: string;
  name: string;
  slug: string;
  code?: string;
  image?: string | null;
  description?: string;
  productCount?: number;
}

