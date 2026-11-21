"use client";
import s from "./ManagerApp.module.css";

export function Load({ error, retry }: { error?: string; retry: () => void }) {
  return error ? (
    <div className={`${s.notice} ${s.error}`} role="alert">
      {error}
      <button className={`${s.btn} ${s.secondary}`} onClick={retry}>
        إعادة المحاولة
      </button>
    </div>
  ) : (
    <p className={s.empty} role="status">
      جارِ تحميل البيانات…
    </p>
  );
}
