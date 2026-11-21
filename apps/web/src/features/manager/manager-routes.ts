import { pages, type Page } from "./manager-navigation";
const details = new Set<Page>(["rep", "area-detail", "team-detail"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseManagerRoute(segments: string[]): { page: Page; id?: string } | null {
  const [section, id] = segments;
  if (segments.length === 1 && pages.some(([page]) => page === section)) return { page: section as Page };
  if (segments.length === 2 && details.has(section as Page) && uuid.test(id)) return { page: section as Page, id };
  return null;
}
export function managerHref(page: Page, id?: string) {
  const segments = details.has(page) ? [page, id ?? ""] : [page];
  if (!parseManagerRoute(segments)) throw new Error("Invalid manager route");
  return `/manager/${segments.join("/")}`;
}
