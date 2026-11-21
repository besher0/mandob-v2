"use client";
import { useViewState } from "@/lib/view-state";
import { CompanyName, CompanyLogo } from "../platform/CompanyTheme";
import { useState } from "react";
import { ThemeIcon } from "../platform/ThemeIcon";
import {
  Dashboard,
  SessionUser,
  Workspace,
  TargetType,
  request,
} from "@/lib/api";
import { TargetList } from "./TargetList";
import { RoundFlow } from "./RoundFlow";
import { AreasPage, AreaDetail, EntityPage, PlanPage } from "./WorkspacePages";
import { Reports } from "./Reports";
import { Leaves } from "./Leaves";
import { Analytics } from "./Analytics";
import { VisitHistory } from "./VisitHistory";

export function RepApp({
  user,
  token,
  workspace,
  dashboard,
  onRefresh,
  onLogout,
}: {
  user: SessionUser;
  token: string;
  workspace: Workspace;
  dashboard: Dashboard;
  onRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [screen, setScreen] = useViewState<
    | "home"
    | "doctors"
    | "round"
    | "history"
    | "profile"
    | "pharmacies"
    | "hospitals"
    | "areas"
    | "area"
    | "plan"
    | "reports"
    | "report-history"
    | "leaves"
    | "analytics"
  >("rep/RepApp.tsx:screen", "home");
  const [editingRound, setEditingRound] = useState(false);
  const [areaId, setAreaId] = useViewState("rep/RepApp.tsx:areaId", "");
  const [areaType, setAreaType] = useViewState<TargetType>("rep/RepApp.tsx:areaType", "DOCTOR");
  const [roundContext, setRoundContext] = useViewState<{
    type: TargetType;
    areaIds: string[];
  }>("rep:roundContext", { type: "DOCTOR", areaIds: [] });
  const [roundBack, setRoundBack] = useViewState<typeof screen>("rep/RepApp.tsx:roundBack", "home");
  function startRound() {
    setRoundBack(screen);
    setRoundContext({
      type:
        screen === "pharmacies"
          ? "PHARMACY"
          : screen === "hospitals"
            ? "HOSPITAL"
            : screen === "area"
              ? areaType
              : "DOCTOR",
      areaIds: screen === "area" ? [areaId] : [],
    });
    navigate("round");
  }
  const [message, setMessage] = useState("");
  function navigate(next: typeof screen) {
    setEditingRound(false);
    setScreen(next);
    setMessage("");
    window.scrollTo({ top: 0 });
  }
  const summary = workspace.summary;
  const weekly = dashboard.weeklySummary;
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const unavailable = () => setMessage("الإعدادات مؤجلة إلى مرحلة لاحقة.");
  async function showNotifications() {
    if (loadingNotifications) return;
    setLoadingNotifications(true);
    try {
      const result = await request<{
        items: { id: string; title: string; message: string }[];
        total: number;
      }>("/rep/notifications", token);
      setMessage(
        result.items.length
          ? `${result.total > result.items.length ? `آخر ${result.items.length} إشعاراً من ${result.total}:\n\n` : ""}${result.items.map((n) => `${n.title}\n${n.message}`).join("\n\n")}`
          : "لا توجد إشعارات حالياً.",
      );
      window.scrollTo({ top: 0 });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "تعذر تحميل الإشعارات.");
    } finally {
      setLoadingNotifications(false);
    }
  }
  const stat = (value: string | number, label: string) => (
    <div className="hero-stat">
      <strong>
        <bdi>{value}</bdi>
      </strong>
      <span>{label}</span>
    </div>
  );
  async function saved() {
    setScreen("history");
    setMessage("تم تسجيل الجولة بنجاح");
    window.scrollTo({ top: 0 });
    try {
      await onRefresh();
    } catch {
      setMessage(
        "تم تسجيل الجولة بنجاح، وتعذر تحديث الملخص. أعد تحميل البيانات.",
      );
    }
  }
  return (
    <main className="app-shell rep-workspace">
      <div className="phone">
        <div className="status" />
        <header className="topbar">
          <div className="brand">
            <div className="logo"><CompanyLogo/></div>
            <div>
              <h1><CompanyName/></h1>
              <small>المساعد اليومي</small>
            </div>
          </div>
          <button
            className="icon-btn"
            aria-label="الإشعارات"
            onClick={() => void showNotifications()}
            disabled={loadingNotifications}
          >
            <ThemeIcon name="bell"/>
          </button>
        </header>
        {message && (
          <div className="status-message" role="status">
            {message}
            <button
              className="back"
              aria-label="إغلاق الرسالة"
              onClick={() => setMessage("")}
            >
              ×
            </button>
          </div>
        )}
        {screen === "home" && (
          <section className="screen">
            <div className="hero">
              <h2>صباح الخير، {user.name || user.username}</h2>
              <p>كل ما تحتاجه لإدارة أسبوعك وسايكلك الحالي.</p>
              <div className="hero-row">
                {stat(`${summary?.doctors.coverage ?? 0}%`, "تغطية السايكل")}
                {stat(
                  `${workspace.cycle?.remainingDays ?? 0} أيام`,
                  "متبقي للنهاية",
                )}
                {stat(
                  `${weekly.completedVisits} / ${weekly.workingDayTarget}`,
                  "زيارات الأسبوع",
                )}
                {stat(summary?.doctors.remainingVisits ?? 0, "زيارة متبقية")}
              </div>
            </div>
            {!workspace.cycle && (
              <p className="empty">لا يوجد سايكل فعال مسند إليك.</p>
            )}
            <div className="section-title">
              <h3>تنبيهات مهمة</h3>
              <button onClick={() => navigate("analytics")}>عرض الكل</button>
            </div>
            <div className="notice">
              <div className="dot danger" />
              <div>
                <strong>{summary?.unvisitedA ?? 0} أطباء A غير مزارين</strong>
                <p>
                  {summary?.unvisitedAAreas.length
                    ? `موزعون على ${summary.unvisitedAAreas.map((a) => a.name).join("، ")}.`
                    : "لا يوجد أطباء A غير مزارين حالياً."}
                </p>
              </div>
            </div>
            <div className="notice">
              <div className="dot warning" />
              <div>
                <strong>
                  {summary?.lowCoverageAreas.length ?? 0} مناطق بحاجة تغطية
                </strong>
                <p>
                  {summary?.lowCoverageAreas.length
                    ? summary.lowCoverageAreas.map((a) => a.name).join("، ")
                    : "لا توجد مناطق منخفضة التغطية حالياً."}
                </p>
              </div>
            </div>
            <div className="section-title">
              <h3>مساحة العمل</h3>
              <span className="meta">وصول سريع للجهات والخطة</span>
            </div>
            <div className="home-shortcuts">
              <Hub
                tone="doctors"
                icon="👨‍⚕️"
                title="الأطباء"
                text="قائمة الأطباء مع التصنيف والاختصاص وتكرار الزيارة."
                values={[
                  [summary?.doctors.total ?? 0, "طبيب"],
                  [summary?.doctors.unvisited ?? 0, "غير مزار"],
                ]}
                onClick={() => navigate("doctors")}
              />
              <Hub
                tone="pharmacies"
                icon="💊"
                title="الصيدليات"
                text="كل الصيدليات مصنفة حسب الفئة والمنطقة."
                values={[
                  [summary?.pharmacies.total ?? 0, "صيدلية"],
                  [summary?.pharmacies.unvisited ?? 0, "غير مزار"],
                ]}
                onClick={() => navigate("pharmacies")}
              />
              <Hub
                tone="hospitals"
                icon="🏥"
                title="المشافي"
                text="المشافي العامة والخاصة والمراكز التخصصية."
                values={[
                  [summary?.hospitals.total ?? 0, "مشفى"],
                  [summary?.hospitals.unvisited ?? 0, "غير مزار"],
                ]}
                onClick={() => navigate("hospitals")}
              />
              <Hub
                tone="areas"
                icon="📍"
                title="المناطق"
                text="التغطية وتوزع الجهات الطبية ضمن كل منطقة."
                values={[
                  [workspace.areas.length, "منطقة"],
                  [`${summary?.areaCoverage ?? 0}%`, "تغطية"],
                ]}
                onClick={() => navigate("areas")}
              />
              <button
                className="hub-card hub-plan wide"
                onClick={() => navigate("plan")}
              >
                <div className="row">
                  <div>
                    <div className="hub-icon"><ThemeIcon name="teams" size={28}/></div>
                    <strong>الخطة والأصناف</strong>
                    <p>أهداف السايكل، الأصناف ذات الأولوية وتعليمات المدير.</p>
                  </div>
                  <span className="badge a">
                    {summary?.doctors.coverage ?? 0}% منجزة
                  </span>
                </div>
                <div className="hub-metrics three">
                  <div>
                    <b>
                      <bdi>
                        {weekly.completedVisits} / {weekly.workingDayTarget}
                      </bdi>
                    </b>
                    <span>زيارات الأسبوع</span>
                  </div>
                  <div>
                    <b>{summary?.doctors.requiredVisits ?? 0}</b>
                    <span>زيارات السايكل</span>
                  </div>
                  <div>
                    <b>{workspace.cycle?.remainingDays ?? 0} أيام</b>
                    <span>متبقية</span>
                  </div>
                </div>
              </button>
            </div>
          </section>
        )}
        {screen === "doctors" && (
          <section className="screen">
            <div className="page-head">
              <h2>الأطباء</h2>
              <button
                className="back"
                aria-label="رجوع"
                onClick={() => navigate("home")}
              >
                ←
              </button>
            </div>
            <div className="entity-hero">
              <div>
                <strong>دليل الأطباء</strong>
                <p className="meta">ابحث وصنّف واختر زياراتك القادمة بسهولة.</p>
              </div>
              <ThemeIcon name="doctors" size={28}/>
            </div>
            <div className="stats-row">
              <Mini
                value={summary?.doctors.total ?? 0}
                label="إجمالي الأطباء"
              />
              <Mini value={summary?.doctors.unvisited ?? 0} label="غير مزار" />
              <Mini value={summary?.doctors.aCount ?? 0} label="أطباء A" />
            </div>
            <TargetList token={token} workspace={workspace} />
            <button className="context-tour" onClick={startRound}>
              ▶ ابدأ جولة أطباء
            </button>
          </section>
        )}
        {(screen === "pharmacies" || screen === "hospitals") && (
          <EntityPage
            key={screen}
            type={screen === "pharmacies" ? "PHARMACY" : "HOSPITAL"}
            token={token}
            workspace={workspace}
            onBack={() => navigate("home")}
          />
        )}
        {screen === "areas" && (
          <AreasPage
            workspace={workspace}
            onBack={() => navigate("home")}
            onOpen={(id) => {
              setAreaId(id);
              setAreaType("DOCTOR");
              navigate("area");
            }}
          />
        )}
        {screen === "area" && (
          <AreaDetail
            areaId={areaId}
            type={areaType}
            onType={setAreaType}
            workspace={workspace}
            token={token}
            onBack={() => navigate("areas")}
          />
        )}
        {screen === "plan" && (
          <PlanPage
            workspace={workspace}
            dashboard={dashboard}
            onBack={() => navigate("home")}
          />
        )}
        {screen === "round" && (
          <RoundFlow
            token={token}
            workspace={workspace}
            onBack={() => navigate(roundBack)}
            initialType={roundContext.type}
            initialAreaIds={roundContext.areaIds}
            onSaved={() => void saved()}
          />
        )}
        {screen === "history" && (
          <VisitHistory onEditingChange={setEditingRound} token={token} workspace={workspace} onChanged={onRefresh} onBack={() => navigate("profile")} />
        )}
        {(screen === "reports" || screen === "report-history") && (
          <Reports
            key={screen}
            token={token}
            name={user.name}
            history={screen === "report-history"}
            onBack={() =>
              navigate(screen === "report-history" ? "profile" : "home")
            }
            onHistory={() => navigate("report-history")}
          />
        )}
        {screen === "analytics" && (
          <Analytics
            token={token}
            workspace={workspace}
            onBack={() => navigate("home")}
          />
        )}
        {screen === "leaves" && (
          <Leaves token={token} onBack={() => navigate("profile")} />
        )}
        {screen === "profile" && (
          <section className="screen">
            <div className="page-head">
              <h2>حسابي</h2>
              <button
                className="back"
                aria-label="رجوع"
                onClick={() => navigate("home")}
              >
                ←
              </button>
            </div>
            <div className="list-card">
              <strong>{user.name || user.username}</strong>
              <div className="meta">
                مندوب طبي
                {dashboard.rep?.teams
                  ? dashboard.rep.teams
                      .map((team) => ` • ${team.name}`)
                      .join("")
                  : dashboard.rep?.team
                    ? ` • ${dashboard.rep.team.name}`
                    : ""}
              </div>
            </div>
            <button
              className="action-card profile-link"
              onClick={() => navigate("history")}
            >
              <div>
                <strong>سجل الزيارات</strong>
                <small>الجولات والزيارات المسجلة</small>
              </div>
              <span>←</span>
            </button>
            <button
              className="action-card profile-link"
              onClick={() => navigate("report-history")}
            >
              <div>
                <strong>سجل التقارير</strong>
                <small>المحفوظة والمرسلة إلى المدير</small>
              </div>
              <span>←</span>
            </button>
            <button
              className="action-card profile-link"
              onClick={() => navigate("leaves")}
            >
              <div>
                <strong>الإجازات</strong>
                <small>طلب جديد ومتابعة الطلبات</small>
              </div>
              <span>←</span>
            </button>
            <button className="action-card profile-link" onClick={unavailable}>
              <div>
                <strong>الإعدادات</strong>
                <small>الإشعارات واللغة</small>
              </div>
              <span>←</span>
            </button>
            <button className="secondary full" onClick={() => void onLogout()}>
              تسجيل الخروج
            </button>
          </section>
        )}
        {screen !== "round" && !editingRound && (
          <button className="global-tour-fab" onClick={startRound}>
            {screen === "doctors"
              ? "＋ جولة أطباء"
              : screen === "pharmacies"
                ? "＋ جولة صيدليات"
                : screen === "hospitals"
                  ? "＋ جولة مشافي"
                  : screen === "area"
                    ? "＋ جولة من المنطقة"
                    : "＋ ابدأ جولة"}
          </button>
        )}
        <nav className="bottom-nav" aria-label="التنقل الرئيسي">
          <button
            className={`nav-btn ${screen === "home" ? "active" : ""}`}
            onClick={() => navigate("home")}
          >
            <ThemeIcon name="home" className="nav-icon"/>
            <span>الرئيسية</span>
          </button>
          <button
            className={`nav-btn ${screen === "analytics" ? "active" : ""}`}
            onClick={() => navigate("analytics")}
          >
            <ThemeIcon name="analytics" className="nav-icon"/>
            <span>التحليل</span>
          </button>
          <button
            className={`nav-btn ${screen === "reports" ? "active" : ""}`}
            onClick={() => navigate("reports")}
          >
            <ThemeIcon name="reports" className="nav-icon"/>
            <span>التقارير</span>
          </button>
          <button
            className={`nav-btn ${screen === "profile" ? "active" : ""}`}
            onClick={() => navigate("profile")}
          >
            <ThemeIcon name="account" className="nav-icon"/>
            <span>حسابي</span>
          </button>
        </nav>
      </div>
    </main>
  );
}
function Hub({
  tone,
  icon,
  title,
  text,
  values,
  onClick,
}: {
  tone: string;
  icon: string;
  title: string;
  text: string;
  values: [string | number, string][];
  onClick: () => void;
}) {
  return (
    <button className={`hub-card hub-${tone}`} onClick={onClick}>
      <div className="hub-icon"><ThemeIcon name={icon} size={28}/></div>
      <strong>{title}</strong>
      <p>{text}</p>
      <div className="hub-metrics">
        {values.map(([value, label]) => (
          <div key={label}>
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </button>
  );
}
function Mini({ value, label }: { value: number; label: string }) {
  return (
    <div className="mini">
      <strong>
        <bdi>{value}</bdi>
      </strong>
      <span>{label}</span>
    </div>
  );
}
