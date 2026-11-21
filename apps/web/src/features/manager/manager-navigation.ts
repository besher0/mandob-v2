export const pages = [
  ["dashboard", "▦", "لوحة التحكم"],
  ["team", "👥", "الفريق"],
  ["teams", "🗂", "الفرق"],
  ["doctors", "🩺", "الأطباء"],
  ["pharmacies", "💊", "الصيدليات"],
  ["hospitals", "🏥", "المشافي"],
  ["areas", "📍", "المناطق"],
  ["tours", "🚗", "الجولات"],
  ["reports", "📄", "التقارير"],
  ["leaves", "🏖", "طلبات الإجازة"],
  ["analytics", "📊", "التحليلات"],
  ["products", "📦", "المنتجات"],
  ["settings", "⚙", "الإعدادات"],
] as const;
export type Page = (typeof pages)[number][0] | "rep" | "area-detail" | "team-detail";
export const kinds: Record<string, string> = {
  DOCTOR: "أطباء",
  PHARMACY: "صيدليات",
  HOSPITAL: "مشافي",
};
