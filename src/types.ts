export type ProductItem = {
  rank: number;
  title: string;
  brand: string;
  asin?: string;
  url?: string;
  image?: string;
};

export type BrandStats = {
  brand: string;
  top1To10: number;
  top11To50: number;
  top51To100: number;
  total: number;
  percentage: number;
};
