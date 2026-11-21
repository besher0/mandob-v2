import type { Named } from "@/lib/api";
export type SalesOptions = {
  provinces: Named[];
  products: Named[];
  targets: (Named & { type: "PHARMACY" | "HOSPITAL" })[];
  agents: (Named & { provinceId: string; province: Named })[];
  accounts: (Named & { username: string; status: string })[];
};
export type SalesVisit = {
  id: string;
  provinceId: string;
  targetId: string;
  visitedOn: string;
  notes: string;
  author: Named;
  target: Named;
  province: Named;
};
export type SalesItemInput = {
  productId: string;
  quantity: number;
  unitPrice: string;
  offerType: "NONE" | "BONUS" | "DISCOUNT";
  bonusQuantity: number;
  discountPercent: string;
};
export type SalesOrder = {
  id: string;
  orderedOn: string;
  notes: string;
  total: string;
  currency: string;
  author: Named;
  target: Named;
  province: Named;
  agent: Named;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  reviewer: Named | null;
  items: (SalesItemInput & {
    id: string;
    productName: string;
    total: string;
  })[];
};
export type SalesPage<T> = { items: T[]; total: number; page: number };
export const statusLabels = {
  PENDING: "بانتظار الموافقة",
  APPROVED: "موافق عليه",
  REJECTED: "مرفوض",
};
