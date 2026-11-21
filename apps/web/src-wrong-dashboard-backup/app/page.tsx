"use client";

import { FormEvent, useEffect, useState } from "react";

const API =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

type AuthUser = {
  name: string;
  username: string;
};

type Dashboard = {
  cycle: {
    name: string;
    startsAt: string;
    endsAt: string;
  };
  activeRound: {
    id: string;
    startedAt: string;
  } | null;
  cycleProgress: {
    totalTargets: number;
    completedTargets: number;
    requiredVisits: number;
    creditedVisits: number;
    coveragePercent: number;
    elapsedPercent: number;
  };
  weeklySummary: {
    completedVisits: number;
    workingDayTarget: number;
    targetAchievementPercent: number;
  };
  overdueDoctors: {
    total: number;
    items: Array<{
      targetId: string;
      name: string;
      class: { code: string };
      area: { name: string } | null;
      requiredVisits: number;
      completedVisits: number;
      behindBy: number;
    }>;
  };
};

export default function Home() {
  const [username, setUsername] = useState("rep.demo");
  const [password, setPassword] = useState("MedRepDev!2026");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const savedToken = localStorage.getItem("medrep_token");
    const savedUser = localStorage.getItem("medrep_user");

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      loadDashboard(savedToken);
    }
  }, []);

  async function loadDashboard(accessToken: string) {
    try {
      const response = await fetch(`${API}/rep/dashboard`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("تعذر تحميل بيانات الرئيسية");
      }

      const data = await response.json();
      setDashboard(data);
    } catch {
      setError("تعذر الاتصال بالسيرفر");
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error();
      }

      const data = await response.json();

      localStorage.setItem("medrep_token", data.accessToken);
      localStorage.setItem("medrep_user", JSON.stringify(data.user));

      setToken(data.accessToken);
      setUser(data.user);

      await loadDashboard(data.accessToken);
    } catch {
      setError("اسم المستخدم أو كلمة المرور غير صحيحة");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("medrep_token");
    localStorage.removeItem("medrep_user");
    setToken(null);
    setUser(null);
    setDashboard(null);
  }

  if (!token || !user) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="brand-mark">M</div>
          <p className="eyebrow">MED-TECH</p>
          <h1>تسجيل الدخول</h1>
          <p className="muted">نظام إدارة المندوبين الطبيين</p>

          <form onSubmit={login}>
            <label>
              اسم المستخدم
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>

            <label>
              كلمة المرور
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {error && <div className="error">{error}</div>}

            <button disabled={loading}>
              {loading ? "جارِ الدخول..." : "تسجيل الدخول"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (!dashboard) {
    return <main className="loading">جارِ تحميل لوحة التحكم...</main>;
  }

  const progress = dashboard.cycleProgress;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">M</div>
          <div>
            <strong>MED-TECH</strong>
            <span>Medical CRM</span>
          </div>
        </div>

        <nav>
          <button className="nav-item active">الرئيسية</button>
          <button className="nav-item">الأطباء</button>
          <button className="nav-item">الجولات</button>
          <button className="nav-item">التقارير</button>
          <button className="nav-item">الإجازات</button>
        </nav>

        <div className="sidebar-user">
          <div className="avatar">{user.name?.charAt(0) || "م"}</div>
          <div>
            <strong>{user.name}</strong>
            <span>{user.username}</span>
          </div>
          <button className="logout" onClick={logout}>
            خروج
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="muted">لوحة المندوب الطبي</p>
            <h1>مرحباً، {user.name}</h1>
          </div>

          <div className="cycle-chip">
            <span>الدورة الحالية</span>
            <strong>{dashboard.cycle.name}</strong>
          </div>
        </header>

        {dashboard.activeRound && (
          <section className="round-banner">
            <div>
              <span className="live-dot" />
              <strong>أنت حالياً ضمن جولة ميدانية</strong>
              <p>يمكنك متابعة تسجيل زياراتك خلال الجولة الحالية.</p>
            </div>
            <button>متابعة الجولة</button>
          </section>
        )}

        <section className="stats-grid">
          <article className="stat-card primary-stat">
            <div className="stat-head">
              <span>تغطية الدورة</span>
              <strong>{progress.coveragePercent}%</strong>
            </div>

            <div className="progress">
              <div
                className="progress-value"
                style={{ width: `${progress.coveragePercent}%` }}
              />
            </div>

            <p>
              {progress.creditedVisits} من {progress.requiredVisits} زيارة مطلوبة
            </p>
          </article>

          <article className="stat-card">
            <span>الأطباء</span>
            <strong>{progress.totalTargets}</strong>
            <p>{progress.completedTargets} مكتملين</p>
          </article>

          <article className="stat-card">
            <span>زيارات هذا الأسبوع</span>
            <strong>{dashboard.weeklySummary.completedVisits}</strong>
            <p>من هدف {dashboard.weeklySummary.workingDayTarget} زيارة</p>
          </article>

          <article className="stat-card">
            <span>تقدم الوقت</span>
            <strong>{progress.elapsedPercent}%</strong>
            <p>من مدة الدورة الحالية</p>
          </article>
        </section>

        <section className="main-grid">
          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>الأطباء المتأخرون</h2>
                <p>الأولوية المقترحة للزيارات القادمة</p>
              </div>
              <span className="count-badge">
                {dashboard.overdueDoctors.total}
              </span>
            </div>

            <div className="doctor-list">
              {dashboard.overdueDoctors.items.map((doctor) => (
                <div className="doctor-row" key={doctor.targetId}>
                  <div className="doctor-avatar">
                    {doctor.name.replace("د. ", "").charAt(0)}
                  </div>

                  <div className="doctor-info">
                    <strong>{doctor.name}</strong>
                    <span>
                      {doctor.area?.name ?? "بدون منطقة"} · Class{" "}
                      {doctor.class.code}
                    </span>
                  </div>

                  <div className="visit-status">
                    <strong>
                      {doctor.completedVisits}/{doctor.requiredVisits}
                    </strong>
                    <span>زيارة</span>
                  </div>

                  <button className="small-button">زيارة</button>
                </div>
              ))}
            </div>
          </article>

          <article className="panel weekly-panel">
            <div className="panel-header">
              <div>
                <h2>الأداء الأسبوعي</h2>
                <p>نسبة تحقيق الهدف</p>
              </div>
            </div>

            <div className="achievement">
              <strong>
                {dashboard.weeklySummary.targetAchievementPercent}%
              </strong>
              <span>تحقيق الهدف الأسبوعي</span>
            </div>

            <div className="weekly-numbers">
              <div>
                <strong>{dashboard.weeklySummary.completedVisits}</strong>
                <span>منجز</span>
              </div>
              <div>
                <strong>{dashboard.weeklySummary.workingDayTarget}</strong>
                <span>المطلوب</span>
              </div>
            </div>

            <button className="outline-button">عرض التقرير الأسبوعي</button>
          </article>
        </section>

        <button className="fab">+ بدء زيارة جديدة</button>
      </main>
    </div>
  );
}
