"use client";
import { useEffect, useState } from "react";
import { ApiError, request } from "@/lib/api";
export function useResource<T>(path: string, token: string, refreshMs = 0) {
  const [retry, setRetry] = useState(0);
  const key = `${path}:${retry}`;
  const [state, setState] = useState<{ key: string; token?: string; data?: T; error?: string }>(
    { key: "" },
  );
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function fetchData() {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const data = await request<T>(path, token, { signal: controller.signal });
        if (!controller.signal.aborted) setState({ key, token, data });
      } catch (err) {
        if (!controller.signal.aborted) setState(previous => !(err instanceof ApiError && [401,403].includes(err.status)) && previous.key === key && previous.token === token && previous.data ? previous : { key, token, error: err instanceof Error ? err.message : "تعذر التحميل" });
      } finally { pending = false; }
    }
    void fetchData();
    const refreshVisible = () => { if (document.visibilityState === "visible") void fetchData(); };
    const timer = refreshMs ? window.setInterval(refreshVisible, refreshMs) : undefined;
    if (refreshMs) {
      window.addEventListener("focus", refreshVisible);
      document.addEventListener("visibilitychange", refreshVisible);
    }
    return () => {
      controller.abort();
      if (timer) window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [key, path, token, refreshMs]);

  return {
    data: state.key === key && state.token === token ? state.data : undefined,
    error: state.key === key && state.token === token ? state.error : undefined,
    reload: () => setRetry((v) => v + 1),
  };
}
export function ResourceState({
  error,
  retry,
}: {
  error?: string;
  retry: () => void;
}) {
  return error ? (
    <div className="error" role="alert">
      {error}
      <button className="back" onClick={retry}>
        إعادة المحاولة
      </button>
    </div>
  ) : (
    <p className="empty" role="status">
      جارِ التحميل…
    </p>
  );
}
