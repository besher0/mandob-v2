"use client";
import { createClientRef } from "@/lib/client-ref";
import { useViewState } from "@/lib/view-state";
import { ThemeIcon } from "../platform/ThemeIcon";
import { useRef, useState } from "react";
import {
  ApiError,
  request,
  RoundInput,
  Target,
  TargetType,
  Workspace,
} from "@/lib/api";
import { TargetCard, TargetList } from "./TargetList";

const types: { type: TargetType; label: string; icon: string }[] = [
  { type: "DOCTOR", label: "أطباء", icon: "👨‍⚕️" },
  { type: "PHARMACY", label: "صيدليات", icon: "💊" },
  { type: "HOSPITAL", label: "مشافي", icon: "🏥" },
];
export type RoundEdit = { id:string;revision:number;type:TargetType;areaIds:string[];targets:Target[];productIds:string[];visitDate:string;notes:string };
export function RoundFlow({
  token,
  workspace,
  onBack,
  onSaved,
  edit,
  initialType = "DOCTOR",
  initialAreaIds = [],
}: {
  token: string;
  workspace: Workspace;
  onBack: () => void;
  onSaved: () => void;
  edit?: RoundEdit;
  initialType?: TargetType;
  initialAreaIds?: string[];
}) {
  const draftKey = `round:${edit?.id ?? "new"}:${workspace.cycle?.id ?? ""}`;
  const [savedPending, setSavedPending] = useViewState<RoundInput | null>(`${draftKey}:pending`, null);
  const [step, setStep] = useViewState<"areas" | "targets" | "finish">(`${draftKey}:step`, "areas");
  const [type, setType] = useViewState<TargetType>(`${draftKey}:type`, edit?.type ?? initialType);
  const [areaIds, setAreaIds] = useViewState<string[]>(`${draftKey}:areaIds`, edit?.areaIds ?? initialAreaIds);
  const [selected, setSelected] = useViewState<Target[]>(`${draftKey}:selected`, edit?.targets ?? []);
  const [products, setProducts] = useViewState<string[]>(`${draftKey}:products`, edit?.productIds ?? []);
  const [date, setDate] = useViewState(`${draftKey}:date`, edit?.visitDate ?? workspace.cycle?.today ?? "");
  const [notes, setNotes] = useViewState(`${draftKey}:notes`, edit?.notes ?? "");
  const policy = edit ? 'DISABLED' : workspace.roundLocationPolicy ?? 'DISABLED';
  const [location, setLocation] = useState<{latitude:number;longitude:number;accuracy:number;locationCapturedAt:string}|null>(null);
  const [locating, setLocating] = useState(false);
  const [locationReason, setLocationReason] = useViewState(`${draftKey}:locationReason`, '');
  function locate() {
    setError('');
    if (!window.isSecureContext || !navigator.geolocation) { setError('تحديد الموقع يحتاج رابط HTTPS وإذن الموقع من المتصفح.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {setLocation({latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,locationCapturedAt:new Date(position.timestamp).toISOString()});setLocating(false);},()=>{setError('تعذر تحديد الموقع. اسمح بإذن الموقع وأعد المحاولة.');setLocating(false);},{enableHighAccuracy:true,maximumAge:0,timeout:20000});
  }
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(!!savedPending);
  const pending = useRef<RoundInput | null>(savedPending);
  const lock = useRef(false);
  const label = types.find((t) => t.type === type)!.label;
  function go(next: typeof step) {
    setError("");
    setStep(next);
    window.scrollTo({ top: 0 });
  }
  async function save() {
    if (lock.current || !workspace.cycle) return;
    lock.current = true;
    setSaving(true);
    setSubmitted(true);
    setError("");
    pending.current ??= {
      clientRef: createClientRef(),
      ...(policy !== "DISABLED" ? location ?? {locationReason} : {}),
      cycleId: workspace.cycle.id,
      type,
      areaIds,
      targetIds: selected.map((t) => t.id),
      productIds: products,
      visitDate: date,
      notes,
    };
    setSavedPending(pending.current);
    try {
      await request(edit ? `/rep/rounds/${edit.id}` : "/rep/rounds", token, {
        method: edit ? "PATCH" : "POST",
        body: JSON.stringify({...pending.current,...(edit ? {revision:edit.revision} : {})}),
      });
      setSavedPending(null); setLocation(null); setLocationReason(""); setStep("areas"); setSelected([]); setProducts([]); setAreaIds([]); setNotes(""); setDate(workspace.cycle?.today ?? "");
      onSaved();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status >= 400 &&
        err.status < 500 &&
        (err.status !== 409 || !!edit)
      ) {
        pending.current = null;
        setSavedPending(null);
        setSubmitted(false);
      }
      setError(err instanceof Error ? err.message : "تعذر تسجيل الجولة.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  // Keep the submitted payload stable after an uncertain network result; retry uses the same UUID.
  return (
    <section className="screen">
      <div className="page-head">
        <h2>
          {step === "areas"
            ? (edit ? "تعديل الجولة" : "ابدأ جولة")
            : step === "targets"
              ? `اختيار ال${label}`
              : "إنهاء الجولة"}
        </h2>
        <button
          className="back"
          disabled={saving || submitted}
          onClick={() =>
            step === "areas"
              ? onBack()
              : go(step === "finish" ? "targets" : "areas")
          }
          aria-label="رجوع"
        >
          ←
        </button>
      </div>
      {!workspace.cycle ? (
        <p className="empty">لا يوجد سايكل فعال مسند إليك.</p>
      ) : (
        <>
          {step === "areas" && (
            <>
              <div className="section-title">
                <h3>نوع الجولة</h3>
              </div>
              <div className="round-types">
                {types.map((t) => (
                  <button
                    key={t.type}
                    className={`action-card ${type === t.type ? "selected" : ""}`}
                    aria-pressed={type === t.type}
                    onClick={() => {
                      setType(t.type);
                      setSelected([]);
                    }}
                  >
                    <ThemeIcon name={t.icon} size={28}/>
                    <strong>{t.label}</strong>
                    <small>زيارات ال{t.label}</small>
                  </button>
                ))}
              </div>
              <div className="section-title">
                <h3>اختر منطقة أو أكثر</h3>
                <span className="meta">
                  {workspace.areas.length} مناطق متاحة
                </span>
              </div>
              {workspace.areas.map((area) => (
                <label className="list-card check-card" key={area.id}>
                  <input
                    type="checkbox"
                    checked={areaIds.includes(area.id)}
                    onChange={(e) => {
                      setAreaIds((ids) =>
                        e.target.checked
                          ? [...ids, area.id]
                          : ids.filter((id) => id !== area.id),
                      );
                      setSelected([]);
                    }}
                  />
                  <div>
                    <div className="row">
                      <strong>{area.name}</strong>
                      <span className="badge">{area.coverage}%</span>
                    </div>
                    <div className="meta">
                      {area.total} طبيب • {area.unvisited} غير مزار •{" "}
                      {area.aCount} أطباء A
                    </div>
                  </div>
                </label>
              ))}
              {workspace.areas.length === 0 && (
                <p className="empty">لا توجد مناطق مسندة إليك.</p>
              )}
              <div className="sticky-action">
                <div>
                  <strong>{areaIds.length} مناطق</strong>
                  <div className="meta">
                    {areaIds.length
                      ? workspace.areas
                          .filter((a) => areaIds.includes(a.id))
                          .map((a) => a.name)
                          .join("، ")
                      : "اختر مناطق الجولة"}
                  </div>
                </div>
                <button
                  className="primary"
                  disabled={!areaIds.length}
                  onClick={() => go("targets")}
                >
                  التالي
                </button>
              </div>
            </>
          )}
          {step === "targets" && (
            <>
              <TargetList
                key={type}
                token={token}
                workspace={workspace}
                type={type}
                areaIds={areaIds}
                selected={selected}
                onSelect={(target, checked) =>
                  setSelected((items) =>
                    checked
                      ? [...items, target]
                      : items.filter((t) => t.id !== target.id),
                  )
                }
              />
              <div className="sticky-action">
                <div>
                  <strong>
                    {selected.length} {label}
                  </strong>
                  <div className="meta">محددون للجولة</div>
                </div>
                <button
                  className="primary"
                  disabled={!selected.length}
                  onClick={() => go("finish")}
                >
                  إنهاء الجولة
                </button>
              </div>
            </>
          )}
          {step === "finish" && (
            <>
              <div className="list-card">
                <div className="row">
                  <strong>ملخص الجولة</strong>
                  <span className="badge green">جاهزة للتسجيل</span>
                </div>
                <p className="meta">
                  {areaIds.length} مناطق • {selected.length} {label} • {label}
                </p>
              </div>
              <div className="section-title">
                <h3>ال{label} المختارون</h3>
                <span className="meta">
                  {selected.length} {label}
                </span>
              </div>
              {selected.map((t) => (
                <TargetCard key={t.id} target={t} />
              ))}
              <fieldset disabled={saving || submitted}>
                <div className="section-title">
                  <h3>الأصناف التي تم الترويج لها</h3>
                </div>
                {workspace.products.map((p) => (
                  <label className="list-card check-card" key={p.id}>
                    <input
                      type="checkbox"
                      checked={products.includes(p.id)}
                      onChange={(e) =>
                        setProducts((ids) =>
                          e.target.checked
                            ? [...ids, p.id]
                            : ids.filter((id) => id !== p.id),
                        )
                      }
                    />
                    <strong>{p.name}</strong>
                  </label>
                ))}
                {workspace.products.length === 0 && (
                  <p className="meta">لا توجد أصناف مسندة إليك.</p>
                )}
                <div className="section-title">
                  <h3>ملاحظة الجولة</h3>
                </div>
                <div className="section-title">
                  <h3>تاريخ الزيارة</h3>
                </div>
                <label className="visit-date-card">
                  <strong>📅 تاريخ تنفيذ الزيارة</strong>
                  <small>حدد اليوم الذي تمت فيه هذه الزيارات فعلياً</small>
                  <input
                    aria-label="تاريخ الزيارة"
                    className="field"
                    type="date"
                    required
                    min={workspace.cycle.startsOn}
                    max={workspace.cycle.today}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <textarea
                  aria-label="ملاحظة الجولة"
                  className="field"
                  rows={4}
                  placeholder="ملاحظة اختيارية"
                  maxLength={4000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </fieldset>
              {policy !== 'DISABLED' && <div className="list-card">
                <strong>موقع تسجيل الجولة {policy === 'REQUIRED' ? '(إلزامي)' : '(اختياري)'}</strong>
                <p className="meta">نلتقط موقعك الحالي عند طلبك فقط، ولا نتتبّع تحركك. الموقع يوثّق مكان التسجيل وليس تاريخ الزيارة المختار.</p>
                <button type="button" className="back" disabled={locating || saving || submitted} onClick={locate}>{locating ? 'جارِ تحديد الموقع…' : location ? 'إعادة تحديد موقعي' : 'تحديد موقعي الحالي'}</button>
                {location && <p role="status">تم تحديد الموقع — الدقة نحو {Math.round(location.accuracy)} متر.</p>}
                {policy === 'OPTIONAL' && location && <button type="button" className="back" disabled={submitted || saving} onClick={()=>setLocation(null)}>التسجيل بدون موقع</button>}
                {policy === 'OPTIONAL' && !location && <label>سبب التسجيل بدون موقع<textarea maxLength={500} value={locationReason} disabled={submitted} onChange={e=>setLocationReason(e.target.value)} placeholder="تعذر التحديد أو سبب خاص"/></label>}
                <button type="button" className="back" disabled={saving} onClick={onBack}>حفظ مسودة والخروج</button>
              </div>}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="primary full"
                disabled={saving || locating || !date || (!submitted && policy === "REQUIRED" && !location) || (!submitted && policy === "OPTIONAL" && !location && !locationReason.trim())}
                onClick={save}
              >
                {saving ? "جارِ الحفظ…" : edit ? "حفظ التعديل" : "تسجيل الجولة"}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
