"use client";
import { usePathname, useRouter } from "next/navigation";
import { managerHref, parseManagerRoute } from "./manager-routes";
import { ManagerProducts } from "./ManagerProducts";
import { ManagerAnalytics } from "./ManagerAnalytics";
import { ManagerAreaDetails } from "./ManagerAreaDetails";
import { useViewState } from "@/lib/view-state";
import { useRef, useState } from "react";
import { request, type SessionUser } from "@/lib/api";
import { LeaveBalanceForm } from "./LeaveBalanceEditor";
import { CycleSettings } from "./CycleSettings";
import { AreaCatalog } from "./AreaCatalog";
import { useResource } from "../rep/useResource";
import type {
  ManagerWorkspace,
} from "./types";
import s from "./ManagerApp.module.css";
import { TargetCatalog } from "./TargetCatalog";
import { RepEditor } from "./RepEditor";
import { Empty } from "./TablePrimitives";
import { RepTable } from "./RepTable";
import { DoctorCycleDetails } from "./TargetProgressTables";
import { TeamEditor } from "./TeamEditor";
import { Rounds } from "./Rounds";
import { ReportList } from "./ReportList";
import { Load } from "./Load";
import { LeaveList } from "./LeaveList";
import { pages, type Page } from "./manager-navigation";
import { ManagerDashboard } from "./ManagerDashboard";
import { ManagerRepDetails } from "./ManagerRepDetails";
import { ManagerDetailDialog, type ManagerDetail } from "./ManagerDetailDialog";
import { ManagerShell } from "./ManagerShell";
export function ManagerApp({
  user,
  token,
  onLogout,
}: {
  user: SessionUser;
  token: string;
  onLogout: () => Promise<void>;
}) {
  const resource = useResource<ManagerWorkspace>("/manager/workspace", token, 15000),
    data = resource.data;
  const [storedTeamDetailId, setTeamDetailId] = useViewState("manager/ManagerApp.tsx:teamDetailId", "");
  const [repEditor, setRepEditor] = useState<{ id?: string } | null>(null);
  const [teamEditor, setTeamEditor] = useState<{
    id: string;
    mode: "settings" | "reps" | "create";
  } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [storedPage, setPage] = useViewState<Page>("manager/ManagerApp.tsx:page", "dashboard"),
    [search, setSearch] = useViewState("manager/ManagerApp.tsx:search", ""),
    [storedAreaId, setAreaId] = useViewState("manager/ManagerApp.tsx:areaId", ""),
    [storedRepId, setRepId] = useViewState("manager/ManagerApp.tsx:repId", ""),
    [message, setMessage] = useState("");
  const [detail, setDetail] = useState<ManagerDetail | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const route = pathname.startsWith("/manager/") ? parseManagerRoute(pathname.slice(9).split("/")) : null;
  const page = route?.page ?? storedPage;
  const repId = route?.page === "rep" ? route.id! : storedRepId;
  const areaId = route?.page === "area-detail" ? route.id! : storedAreaId;
  const teamDetailId = route?.page === "team-detail" ? route.id! : storedTeamDetailId;
  const title =
    pages.find((p) => p[0] === page)?.[2] ??
    (page === "area-detail" ? "تفاصيل المنطقة" : page === "team-detail" ? "تفاصيل الفريق" : "تفاصيل المندوب");
  function navigate(next: Page, id?: string) {
    router.push(managerHref(next, id));
    setPage(next);
    setSidebarOpen(false);
    setSearch("");
    setAreaId("");
    setMessage("");
    window.scrollTo({ top: 0 });
  }
  function openRep(id: string) {
    setRepId(id);
    navigate("rep", id);
  }
  function openDetail(next: NonNullable<typeof detail>) {
    setDetail(next);
    dialog.current?.showModal();
  }
  async function notifications() {
    try {
      const result = await request<{
        items: { title: string; message: string }[];
      }>("/rep/notifications", token);
      setMessage(
        result.items.length
          ? result.items.map((n) => `${n.title}\n${n.message}`).join("\n\n")
          : "لا توجد تنبيهات جديدة.",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "تعذر تحميل التنبيهات.");
    }
  }
  const matches = (name: string) =>
    name
      .toLocaleLowerCase("ar")
      .includes(search.trim().toLocaleLowerCase("ar"));
  const reps =
    data?.reps.filter(
      (r) =>
        matches(r.name) && (!areaId || r.areas.some((a) => a.id === areaId)),
    ) ?? [];
  const targets =
    data?.targets.filter(
      (t) =>
        matches(`${t.name} ${t.specialties.join(" ")} ${t.repName}`) &&
        (!areaId || t.areas.some((a) => a.id === areaId)),
    ) ?? [];
  const selectedArea = data?.areas.find((a) => a.id === areaId);
  const selectedTeam = data?.teams.find(t => t.id === teamDetailId);
  const selectedRep = data?.reps.find((r) => r.id === repId);
  return (
    <ManagerShell user={user} data={data} page={page} title={title}
      sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} navigate={navigate}
      onLogout={onLogout} onRefresh={resource.reload} onNotifications={notifications}
      overlays={<>
      {repEditor && (
        <RepEditor
          repId={repEditor.id}
          token={token}
          onClose={() => setRepEditor(null)}
          onSaved={(text) => {
            setRepEditor(null);
            setMessage(text);
            resource.reload();
          }}
        />
      )}
      {teamEditor && (
        <TeamEditor
          teamId={teamEditor.id}
          mode={teamEditor.mode}
          token={token}
          onClose={() => setTeamEditor(null)}
          onSaved={() => {
            setTeamEditor(null);
            setMessage("تم الحفظ بنجاح.");
            resource.reload();
          }}
        />
      )}
      <ManagerDetailDialog detail={detail} dialog={dialog}/>
      </>}>

          {message && (
            <div className={s.notice} role="status">
              {message}
            </div>
          )}
          {!data ? (
            <Load error={resource.error} retry={resource.reload} />
          ) : (
            <>
              {!data.teams.length && (
                <div className={s.notice}>
                  لا توجد فرق فعالة مسندة إليك كمدير.
                </div>
              )}
              {data.unconfiguredPeriods > 0 && (
                <div className={s.notice}>
                  بعض تكليفات المندوبين لم يكتمل ربطها بالفرق. النتائج أدناه تخص
                  البيانات المرتبطة فقط.
                </div>
              )}
              {!data.cycle && (
                <div className={s.notice}>لا يوجد سايكل فعال حالياً.</div>
              )}
              {page === "dashboard" && <ManagerDashboard data={data} name={user.name} navigate={navigate} openRep={openRep}/> }
              {page !== "dashboard" &&
                page !== "rep" &&
                page !== "area-detail" && (
                  <div className={s.pageHead}>
                    {page === "team" &&
                      user.permissions.includes("users.manage_own") && (
                        <button
                          className={s.btn}
                          onClick={() => setRepEditor({})}
                        >
                          + إضافة مندوب
                        </button>
                      )}
                    <h2>
                      {page === "team"
                        ? "إدارة الفريق"
                        : page === "hospitals"
                          ? "المشافي والمراكز"
                          : title}
                    </h2>
                    <p>
                      {
                        (
                          {
                            team: "متابعة أعضاء الفريق وتوزيع المناطق والاختصاصات",
                            teams: "إدارة الفرق والاختصاصات والمندوبين",
                            doctors: "كل الأطباء المسندين إلى فرقك",
                            pharmacies:
                              "متابعة الصيدليات وتواتر الزيارات والتغطية",
                            hospitals:
                              "متابعة المشافي الحكومية والخاصة والمراكز الطبية",
                            areas: "إدارة مناطق الفريق وتوزيع المندوبين",
                            tours: "متابعة جولات المندوبين وتفاصيل الزيارات",
                            reports: "تقارير أداء المندوبين ضمن فرقك",
                            leaves:
                              "مراجعة طلبات إجازات المندوبين والموافقة عليها",
                            analytics: "تحليل أداء الفريق والتغطية",
                            products: "متابعة الأصناف الترويجية",
                            settings: "إعدادات الفريق والسايكل",
                          } as Record<string, string>
                        )[page]
                      }
                    </p>
                  </div>
                )}
              {[
                "team",
                "doctors",
                "pharmacies",
                "hospitals",
                "areas",
                "tours",
              ].includes(page) && !["doctors", "pharmacies", "hospitals"].includes(page) && (
                <div className={s.catalogToolbar}>
                  <input className={s.catalogSearch}
                    aria-label="بحث في القائمة"
                    placeholder={page === "tours" ? "ابحث بالمندوب أو المنطقة…" : "ابحث بالاسم أو الاختصاص…"}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <details className={s.catalogMore}><summary>الفلاتر{areaId ? " •" : ""}</summary><div className={s.catalogMenu}><label className={s.editorField}>المنطقة<select
                    aria-label="فلتر المنطقة"
                    value={areaId}
                    onChange={(e) => setAreaId(e.target.value)}
                  >
                    <option value="">كل المناطق</option>
                    {data.areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select></label>{areaId && <button className={`${s.btn} ${s.secondary}`} onClick={() => setAreaId("")}>إلغاء فلتر المنطقة</button>}</div></details>
                </div>
              )}
              {page === "team" && (
                <>
                  <div className={s.statsRow}>
                    <div className={`${s.card} ${s.smallStat}`}>
                      <span>إجمالي الفريق</span>
                      <strong>{data.summary.reps}</strong>
                    </div>
                    <div className={`${s.card} ${s.smallStat}`}>
                      <span>متوسط الإنجاز</span>
                      <strong>{data.summary.averageRepCoverage}%</strong>
                    </div>
                  </div>
                  <RepTable
                    items={reps}
                    onOpen={openRep}
                    onEdit={
                      user.permissions.includes("users.manage_own")
                        ? (id) => setRepEditor({ id })
                        : undefined
                    }
                  />
                </>
              )}
              {page === "rep" && <ManagerRepDetails data={data} selectedRep={selectedRep} repId={repId} token={token} canManageBalances={user.permissions.includes("leaves.manage_balances")} onBack={() => navigate("team")} onRound={item => openDetail({type:"round", item})}/>}
              {page === "team-detail" && selectedTeam && <>
                <button className={s.btn} onClick={() => navigate("teams")}>العودة للفرق</button>
                <div className={s.detailIdentity}><h2>{selectedTeam.name}</h2><p className={s.muted}>{selectedTeam.province?.name ?? "المحافظة غير محددة"}</p></div><div className={s.kpis}>{[[selectedTeam.repCount,"المندوبون"],[`${selectedTeam.coverage}%`,"التغطية"],[selectedTeam.doctorProgress.uniqueDoctors,"الأطباء"]].map(([value,label]) => <div className={`${s.card} ${s.kpi}`} key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
                <DoctorCycleDetails key={selectedTeam.id} items={data.targets.filter(t => t.teamId === selectedTeam.id)} summary={selectedTeam.doctorProgress} cycleName={data.cycle?.name}/>
              </>}
              {page === "teams" && (
                <>
                {user.permissions.includes("teams.create_own") && <div className={s.editorActions}><button className={s.btn} onClick={()=>setTeamEditor({id:"",mode:"create"})}>+ إضافة فريق</button></div>}
                <div className={s.cards}>
                  {data.teams.map((t) => (
                    <article className={s.card} key={t.id}>
                      <h3>{t.name}</h3>
                      <p className={s.muted}>
                        {t.province?.name ?? "المحافظة غير محددة"}
                      </p>
                      <p>
                        الاختصاصات:{" "}
                        {t.specialties.map((x) => x.name).join("، ") ||
                          "غير محددة"}
                      </p>
                      <p>
                        الأصناف:{" "}
                        {t.products.map((x) => x.name).join("، ") ||
                          "غير محددة"}
                      </p>
                      <p>المندوبون: {t.repCount}</p>
                      <button className={s.btn} onClick={() => { setTeamDetailId(t.id); navigate("team-detail", t.id); }}>تفاصيل الفريق والسايكل</button>
                      <div className={s.row}>
                        <b>التغطية</b>
                        <b>{t.coverage}%</b>
                      </div>
                      <progress value={t.coverage} max={100} />
                      <div className={s.editorActions}>
                        <button
                          className={`${s.btn} ${s.secondary}`}
                          disabled={
                            !user.permissions.includes("teams.configure_own")
                          }
                          onClick={() =>
                            setTeamEditor({ id: t.id, mode: "settings" })
                          }
                        >
                          تعديل الفريق
                        </button>
                        <button
                          className={`${s.btn} ${s.secondary}`}
                          disabled={
                            !user.permissions.includes("teams.assign_own")
                          }
                          onClick={() =>
                            setTeamEditor({ id: t.id, mode: "reps" })
                          }
                        >
                          إدارة المندوبين
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                </>
              )}
              {(["doctors", "pharmacies", "hospitals"] as string[]).includes(
                page,
              ) && (
                <TargetCatalog
                  toolbar={<><input className={s.catalogSearch} aria-label="بحث في القائمة" placeholder="ابحث بالاسم أو الاختصاص…" value={search} onChange={e => setSearch(e.target.value)}/><details className={s.catalogMore}><summary>الفلاتر{areaId ? " •" : ""}</summary><div className={s.catalogMenu}><label className={s.editorField}>المنطقة<select value={areaId} onChange={e => setAreaId(e.target.value)}><option value="">كل المناطق</option>{data.areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>{areaId && <button className={`${s.btn} ${s.secondary}`} onClick={() => setAreaId("")}>إلغاء فلتر المنطقة</button>}</div></details></>}
                  key={page}
                  type={
                    page === "doctors"
                      ? "DOCTOR"
                      : page === "pharmacies"
                        ? "PHARMACY"
                        : "HOSPITAL"
                  }
                  token={token}
                  canManage={user.permissions.includes("targets.manage")}
                  search={search}
                  areaId={areaId}
                  assignments={targets}
                  onRefresh={resource.reload}
                />
              )}
              {page === "areas" && (
                <>
                  <div className={s.statsRow}>
                    {[
                      [data.areas.length, "إجمالي المناطق"],
                      [`${data.summary.areaCoverage}%`, "متوسط التغطية"],
                      [data.summary.lowCoverageAreas, "مناطق منخفضة"],
                    ].map(([value, label]) => (
                      <div className={`${s.card} ${s.smallStat}`} key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                  <AreaCatalog token={token} canManage={user.permissions.includes("areas.manage_own")} metrics={data.areas} search={search} areaId={areaId} onDetail={id=>{navigate("area-detail", id);setAreaId(id);}} onRefresh={resource.reload}/>
                </>
              )}
              {page === "area-detail" && selectedArea && <ManagerAreaDetails selectedArea={selectedArea} cycle={data.cycle} frequency={data.settings.frequency} onBack={() => navigate("areas")}/>}
              {page === "tours" && (
                <Rounds
                  items={data.rounds.filter(
                    (r) =>
                      matches(
                        `${r.repName} ${r.areas.map((a) => a.name).join(" ")}`,
                      ) &&
                      (!areaId || r.areas.some((a) => a.id === areaId)),
                  )}
                  onOpen={(item) => openDetail({ type: "round", item })}
                />
              )}
              {page === "reports" &&
                (user.permissions.includes("reports.view_team") ? (
                  <ReportList
                    token={token}
                    onOpen={(item) => openDetail({ type: "report", item })}
                  />
                ) : (
                  <Empty>ليس لديك صلاحية عرض التقارير.</Empty>
                ))}
              {page === "leaves" &&
                (user.permissions.includes("leaves.approve_team") ? (
                  <LeaveList token={token} onChanged={resource.reload} />
                ) : (
                  <Empty>ليس لديك صلاحية مراجعة الإجازات.</Empty>
                ))}
              {page === "analytics" && <ManagerAnalytics teams={data.teams} products={data.products}/>}
              {page === "products" && <ManagerProducts products={data.products}/>}
              {page === "settings" && <><CycleSettings key={data.cycle?.id ?? "none"} data={data} token={token} canEdit={user.permissions.includes("cycles.configure")} onSaved={resource.reload}/>{user.permissions.includes("leaves.configure") && data.settings.annualLeaveDays !== null && <LeaveBalanceForm token={token} path="/manager/leave-default" initial={data.settings.annualLeaveDays} onSaved={resource.reload}/>}</>}
            </>
          )}
    </ManagerShell>
  );
}
