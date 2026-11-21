"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";

const Scope = createContext("");

export function ViewStateProvider({
  scope,
  children,
}: {
  scope: string;
  children: ReactNode;
}) {
  return <Scope.Provider value={scope}>{children}</Scope.Provider>;
}

function readStoredValue<T>(storageKey: string, enabled: boolean, fallback: () => T): T {
  if (typeof window !== "undefined" && enabled) {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      // Unavailable storage or malformed JSON must not prevent using the page.
    }
  }
  return fallback();
}

export function useViewState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const scope = useContext(Scope);
  const storageKey = `medrep:view:v1:${scope}:${key}`;
  const fallback = () =>
    typeof initial === "function" ? (initial as () => T)() : initial;
  const [snapshot, setSnapshot] = useState(() => ({
    key: storageKey,
    value: readStoredValue(storageKey, Boolean(scope), fallback),
  }));

  // Restore the new view before committing, so old values cannot be saved under
  // a different province, round or account's key.
  if (snapshot.key !== storageKey) {
    setSnapshot({
      key: storageKey,
      value: readStoredValue(storageKey, Boolean(scope), fallback),
    });
  }

  useEffect(() => {
    if (!scope || snapshot.key !== storageKey) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(snapshot.value));
    } catch {
      // Keep in-memory editing usable when storage is full or blocked.
    }
  }, [scope, storageKey, snapshot]);

  const update: Dispatch<SetStateAction<T>> = (next) => {
    setSnapshot((previous) => ({
      key: previous.key,
      value:
        typeof next === "function"
          ? (next as (old: T) => T)(previous.value)
          : next,
    }));
  };
  return [snapshot.value, update];
}
