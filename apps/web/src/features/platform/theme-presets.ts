import type { Branding } from './CompanyTheme';
export type ThemePreset = { id: string; name: string; description: string; values: Pick<Branding, 'accent'|'layout'|'primary'|'sidebar'|'background'|'font'|'style'> };
export const themePresets: ThemePreset[] = [
  { id: 'CLASSIC', name: 'كلاسيك', description: 'التصميم الأصلي: قائمة داكنة وبطاقات مألوفة.', values: { accent: '#92651b', layout: 'CLASSIC', primary: '#167c5a', sidebar: '#103d30', background: '#f6f8f7', font: 'Tahoma', style: 'CLASSIC' } },
  { id: 'ATLAS', name: 'أطلس', description: 'عملي ومضغوط: قائمة أضيق، بطاقات مستقيمة وجداول مخططة.', values: { accent: '#0f766e', layout: 'ATLAS', primary: '#2454a4', sidebar: '#162b49', background: '#eef2f7', font: 'Arial', style: 'SQUARE' } },
  { id: 'DIWAN', name: 'ديوان', description: 'رسمي: قائمة عريضة، رأس فاتح وخطوط فاصلة وقوائم للمندوب.', values: { accent: '#386b73', layout: 'DIWAN', primary: '#823d45', sidebar: '#40242c', background: '#f7f2ec', font: 'Tahoma', style: 'SQUARE' } },
  { id: 'PEARL', name: 'لؤلؤ', description: 'هادئ وواسع: قائمة عائمة، بطاقات دائرية وظلال خفيفة.', values: { accent: '#177e89', layout: 'PEARL', primary: '#6350a4', sidebar: '#372b55', background: '#f3f1fa', font: 'Arial', style: 'SOFT' } },
];
