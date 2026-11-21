"use client";
import { useViewState } from "@/lib/view-state";
import { useEffect, useState } from "react";
import { Named, request, TargetType, Workspace } from "@/lib/api";
import { RoundFlow, type RoundEdit } from "./RoundFlow";
const tabs: { type: TargetType | ""; label: string }[] = [
  { type: "", label: "الكل" },
  { type: "DOCTOR", label: "أطباء" },
  { type: "PHARMACY", label: "صيدليات" },
  { type: "HOSPITAL", label: "مشافي" },
];
type HistoryItem = {
  id: string;
  roundId: string | null;
  revision: number;
  canEdit: boolean;
  status: string;
  type: TargetType;
  date: string | null;
  areas: Named[];
  targets: Named[];
};
export function VisitHistory({
  token,
  onBack,
  workspace,
  onChanged,
  onEditingChange,
}: {
  token: string;
  workspace: Workspace;
  onChanged: () => Promise<void>;
  onEditingChange: (editing: boolean) => void;
  onBack: () => void;
}) {
  const [edit,setEdit]=useState<RoundEdit|null>(null);
  const [actionError,setActionError]=useState("");
  const [busy,setBusy]=useState(false);
  const [cancelItem,setCancelItem]=useState<HistoryItem|null>(null);
  async function openEdit(id:string){setBusy(true);setActionError("");try{setEdit(await request<RoundEdit>(`/rep/rounds/${id}/edit`,token));onEditingChange(true);}catch(e){setActionError(e instanceof Error?e.message:"تعذر فتح الجولة");}finally{setBusy(false);}}
  async function cancel(){if(!cancelItem?.roundId)return;setBusy(true);setActionError("");try{await request(`/rep/rounds/${cancelItem.roundId}/cancel`,token,{method:"POST",body:JSON.stringify({revision:cancelItem.revision})});setCancelItem(null);setRetry(n=>n+1);await onChanged();}catch(e){setActionError(e instanceof Error?e.message:"تعذر الإلغاء");}finally{setBusy(false);}}
  const [type, setType] = useViewState<TargetType | "">("rep/VisitHistory.tsx:type", "");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    items: HistoryItem[];
    error: string;
  } | null>(null);
  const key = `${type}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    request<{ items: HistoryItem[] }>(
      `/rep/visit-history${type ? `?type=${type}` : ""}`,
      token,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({ key, items: data.items, error: "" });
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setResult({ key, items: [], error: err.message });
      });

  return () => controller.abort();
  }, [token, type, key]);
    if(edit)return <RoundFlow key={edit.id} edit={edit} token={token} workspace={workspace} onBack={()=>{setEdit(null);onEditingChange(false);}} onSaved={()=>{setEdit(null);onEditingChange(false);setRetry(n=>n+1);void onChanged();}}/>;
  return (
    <section className="screen">
      <div className="page-head">
        <h2>سجل الزيارات</h2>
        <button className="back" aria-label="رجوع" onClick={onBack}>
          ←
        </button>
      </div>
      {actionError&&<p className="error" role="alert">{actionError}</p>}
      {cancelItem&&<div className="list-card" role="alertdialog" aria-label="تأكيد إلغاء الجولة"><p>إلغاء الجولة سيزيل زياراتها من التغطيات ويُبقيها في السجل كملغاة. هل تريد الإلغاء؟</p><button className="primary" disabled={busy} onClick={()=>void cancel()}>نعم، إلغاء الجولة</button><button className="back" disabled={busy} onClick={()=>setCancelItem(null)}>رجوع</button></div>}
      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.type}
            className={`tab ${t.type === type ? "active" : ""}`}
            aria-pressed={t.type === type}
            onClick={() => setType(t.type)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {result?.key !== key ? (
        <p className="empty" role="status">
          جارِ تحميل الزيارات…
        </p>
      ) : result.error ? (
        <div className="error" role="alert">
          {result.error}
          <button className="back" onClick={() => setRetry((n) => n + 1)}>
            إعادة المحاولة
          </button>
        </div>
      ) : result.items.length === 0 ? (
        <div className="list-card meta">لا توجد زيارات مسجلة حتى الآن</div>
      ) : (
        result.items.map((item) => (
          <article className="list-card" key={item.id}>
            {item.status === "CANCELLED" && <span className="badge">ملغاة</span>}
            <div className="row">
              <strong>
                جولة {tabs.find((t) => t.type === item.type)?.label}
              </strong>
              <small>
                <bdi>{item.date ?? "—"}</bdi>
              </small>
            </div>
            <div className="meta">
              📍 {item.areas.map((a) => a.name).join("، ") || "—"}
            </div>
            <div className="meta card-detail">
              {item.targets.map((t) => t.name).join("، ")}
            </div>
            {item.canEdit&&item.roundId&&<div className="row"><button className="back" disabled={busy} onClick={()=>void openEdit(item.roundId!)}>تعديل</button><button className="back" disabled={busy} onClick={()=>setCancelItem(item)}>إلغاء الجولة</button></div>}
          </article>
        ))
      )}
    </section>
  );
}
