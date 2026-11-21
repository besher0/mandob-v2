"use client";
import { useRef, useState, type FormEvent } from "react";
import { request } from "@/lib/api";
import { useResource, ResourceState } from "../rep/useResource";
import type { SalesOptions } from "./types";
import s from "./Sales.module.css";
import ui from "../manager/ManagerApp.module.css";

export function SalesSetup({ token }: { token: string }) {
  const resource = useResource<SalesOptions>("/sales/options", token);
  const [kind, setKind] = useState<"accounts" | "agents">("accounts");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request(`/sales/${kind}`, token, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      form.reset();
      resource.reload();
      setMessage("تمت الإضافة.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذرت الإضافة.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!resource.data)
    return <ResourceState error={resource.error} retry={resource.reload} />;
  const data = resource.data;
  return (
    <section className={s.list}>
      <div className={s.tabs}>
        <button
          aria-pressed={kind === "accounts"}
          onClick={() => {
            setKind("accounts");
            setError("");
          }}
        >
          حسابات مدراء المبيعات
        </button>
        <button
          aria-pressed={kind === "agents"}
          onClick={() => {
            setKind("agents");
            setError("");
          }}
        >
          وكلاء المحافظات
        </button>
      </div>
      <form key={kind} className={`${s.form} ${s.panel}`} onSubmit={submit}>
        <fieldset disabled={busy} className={s.form}>
          <h3>{kind === "accounts" ? "إضافة مدير مبيعات" : "إضافة وكيل"}</h3>
          <div className={s.grid}>
            <label>
              الاسم
              <input required name="name" maxLength={120} />
            </label>
            {kind === "agents" ? (
              <label>
                المحافظة
                <select name="provinceId" required defaultValue="">
                  <option value="">اختر المحافظة</option>
                  {data.provinces.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label>
                  اسم الدخول
                  <input
                    name="username"
                    required
                    pattern="[A-Za-z0-9._-]{3,80}"
                    dir="ltr"
                    autoComplete="off"
                  />
                </label>
                <label>
                  كلمة المرور
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={10}
                    maxLength={72}
                    autoComplete="new-password"
                  />
                </label>
              </>
            )}
          </div>
          {error && (
            <p role="alert" className={ui.error}>
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          <button className={s.primaryButton}>
            {busy ? "جارِ الحفظ…" : "إضافة"}
          </button>
        </fieldset>
      </form>
      {kind === "accounts"
        ? data.accounts.map((a) => (
            <article className={s.record} key={a.id}>
              {a.name} — <bdi>{a.username}</bdi> —{" "}
              {a.status === "ACTIVE" ? "نشط" : "غير نشط"}
            </article>
          ))
        : data.agents.map((a) => (
            <article className={s.record} key={a.id}>
              {a.name} — {a.province.name}
            </article>
          ))}
    </section>
  );
}
