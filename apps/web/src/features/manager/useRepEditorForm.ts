"use client";
import { useRef, useState, type FormEvent } from "react";
import { request } from "@/lib/api";
import type { RepEditorFormProps } from "./rep-editor.types";

export function useRepEditorForm({data, token, onSaved}: Omit<RepEditorFormProps, "onClose">) {
  const initial = data.rep?.assignments[0];
  const isCustom = (ids: string[], id?: string) =>
    [...ids].sort().join() !==
    data.teams
      .find((t) => t.id === id)
      ?.specialties.map((s) => s.id)
      .sort()
      .join();
  const [name, setName] = useState(data.rep?.name ?? ""),
    [username, setUsername] = useState(data.rep?.username ?? ""),
    [password, setPassword] = useState(""),
    [teamId, setTeamId] = useState(initial?.teamId ?? ""),
    [areaIds, setAreas] = useState(initial?.areaIds ?? []),
    [productIds, setProducts] = useState(initial?.productIds ?? []),
    [specialtyIds, setSpecialties] = useState(initial?.specialtyIds ?? []),
    [custom, setCustom] = useState(
      !!initial && isCustom(initial.specialtyIds, initial.teamId),
    ),
    [daily, setDaily] = useState(data.rep?.dailyVisitTarget?.toString() ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  const team = data.teams.find((t) => t.id === teamId);
  const availableTeams = data.rep
    ? data.teams.filter((t) =>
        data.rep!.assignments.some((a) => a.teamId === t.id),
      )
    : data.teams;
  function selectTeam(id: string) {
    setTeamId(id);
    setError("");
    const assignment = data.rep?.assignments.find((a) => a.teamId === id),
      next = data.teams.find((t) => t.id === id);
    setAreas(assignment?.areaIds ?? []);
    setProducts(
      assignment?.productIds ?? next?.products.map((p) => p.id) ?? [],
    );
    setSpecialties(assignment?.specialtyIds ?? []);
    setCustom(!!assignment && isCustom(assignment.specialtyIds, id));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await request<{
        id: string;
        effectiveOn: string;
        targetCount: number;
      }>(data.rep ? `/manager/reps/${data.rep.id}` : "/manager/reps", token, {
        method: data.rep ? "PATCH" : "POST",
        body: JSON.stringify({
          name,
          teamId,
          areaIds,
          productIds: productIds.filter((id) =>
            team?.products.some((p) => p.id === id),
          ),
          specialtyIds: custom
            ? specialtyIds.filter((id) =>
                team?.specialties.some((s) => s.id === id),
              )
            : (team?.specialties.map((s) => s.id) ?? []),
          dailyVisitTarget: Number(daily),
          ...(!data.rep ? { username, password } : {}),
        }),
      });
      setPassword("");
      onSaved(
        `تم حفظ المندوب. يسري التكليف من ${result.effectiveOn} ويشمل ${result.targetCount} جهة.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { name, setName, username, setUsername, password, setPassword, teamId, areaIds, setAreas, productIds, setProducts, specialtyIds, setSpecialties, custom, setCustom, daily, setDaily, busy, error, team, availableTeams, selectTeam, submit };
}
