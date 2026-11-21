import type { Named } from "@/lib/api";
export type RepEditorOptions = {
  teams: (Named & {
    provinceId: string;
    specialties: Named[];
    products: Named[];
  })[];
  areas: (Named & { provinceId: string })[];
  rep:
    | null
    | (Named & {
        username: string;
        dailyVisitTarget: number;
        shared: boolean;
        assignments: {
          teamId: string;
          areaIds: string[];
          productIds: string[];
          specialtyIds: string[];
        }[];
      });
};

export type RepEditorFormProps = { data: RepEditorOptions; token: string; onClose: () => void; onSaved: (message: string) => void };
