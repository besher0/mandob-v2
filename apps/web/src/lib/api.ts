import { browserApiBase } from "./browser-session";
export { browserApiBase } from "./browser-session";
export type SessionUser = {
  id: string;
  organizationId: string | null;
  name: string;
  username: string;
  roles: string[];
  permissions: string[];
};
export type Session = {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
};
export type Named = { id: string; name: string };
export type TargetType = "DOCTOR" | "PHARMACY" | "HOSPITAL";
export type Target = Named & {
  type: TargetType;
  affiliation: string | null;
  kind: string | null;
  class: Named & { code: string };
  specialties: Named[];
  locations: {
    id: string;
    areaId: string;
    areaName: string;
    address: string | null;
  }[];
  completedVisits: number;
  requiredVisits: number;
  progress: number;
  lastVisit: string | null;
  status: string;
};
export type Stats = {
  privateCount: number;
  total: number;
  unvisited: number;
  aCount: number;
  remainingVisits: number;
  requiredVisits: number;
  coverage: number;
};
export type Workspace = {
  roundLocationPolicy?: string;
  cycle: {
    id: string;
    name: string;
    today: string;
    startsOn: string;
    endsOn: string;
    remainingDays: number;
  } | null;
  areas: (Named & Stats & { byType: Record<TargetType, Stats> })[];
  products: (Named & { priority: number | null; guidance: string | null })[];
  plan?: { managerInstructions: string | null; aCoverageTarget: number | null };
  classes: (Named & { code: string })[];
  specialties: Named[];
  summary: {
    doctors: Stats;
    pharmacies: Stats;
    hospitals: Stats;
    unvisitedA: number;
    unvisitedAAreas: Named[];
    lowCoverageAreas: Named[];
    areaCoverage: number;
  } | null;
};
export type Dashboard = {
  rep: { team: Named | null; teams?: Named[] } | null;
  weeklySummary: { completedVisits: number; workingDayTarget: number };
};
export type Filters = {
  affiliations: string[];
  kinds: string[];
  search: string;
  classIds: string[];
  specialtyIds: string[];
  unvisited: boolean;
};
export const emptyFilters = (): Filters => ({
  affiliations: [],
  kinds: [],
  search: "",
  classIds: [],
  specialtyIds: [],
  unvisited: false,
});
export type RoundInput = {
  latitude?: number; longitude?: number; accuracy?: number; locationCapturedAt?: string; locationReason?: string;
  clientRef: string;
  cycleId: string;
  type: TargetType;
  areaIds: string[];
  targetIds: string[];
  productIds: string[];
  visitDate: string;
  notes: string;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  token?: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${browserApiBase()}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        ...(init.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, "تعذر الاتصال. تحقق من اتصالك وأعد المحاولة.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      response.status === 401
        ? "انتهت الجلسة أو بيانات الدخول غير صحيحة."
        : response.status === 403
          ? "ليس لديك صلاحية لهذه العملية أو تغيّرت تكليفاتك."
          : typeof body.message === "string" &&
              /[\u0600-\u06ff]/.test(body.message)
            ? body.message
            : "تعذر إتمام الطلب. تحقق من البيانات وأعد المحاولة.";
    throw new ApiError(response.status, message);
  }
  return response.json() as Promise<T>;
}
export const login = (username: string, password: string) => {
  browserApiBase(true);
  return request<Session>("/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
};
export const getTargets = (
  token: string,
  type: TargetType,
  filters: Filters,
  areaIds: string[],
  signal?: AbortSignal,
) => {
  const params = new URLSearchParams({
    type,
    search: filters.search,
    unvisited: String(filters.unvisited),
  });
  if (filters.affiliations.length)
    params.set("affiliations", filters.affiliations.join(","));
  if (filters.kinds.length) params.set("kinds", filters.kinds.join(","));
  if (areaIds.length) params.set("areaIds", areaIds.join(","));
  if (filters.classIds.length)
    params.set("classIds", filters.classIds.join(","));
  if (filters.specialtyIds.length)
    params.set("specialtyIds", filters.specialtyIds.join(","));
  return request<{ items: Target[] }>(`/rep/targets?${params}`, token, {
    signal,
  });
};

export const affiliationLabels: Record<string, string> = {
  INDEPENDENT: "مستقلة",
  UNION: "نقابية",
  CLINIC: "مستوصف",
  HOSPITAL: "مشفى",
  GOVERNMENT: "حكومية",
};
export const hospitalLabels: Record<string, string> = {
  PUBLIC: "حكومي",
  PRIVATE: "خاص",
  SPECIALIZED: "تخصصي",
  MEDICAL_CENTER: "مركز طبي",
};
