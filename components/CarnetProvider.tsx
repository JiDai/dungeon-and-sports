"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { STORAGE_KEY, TABS } from "@/lib/data";
import type { CarnetView, TabId } from "@/lib/types";

interface CarnetContextValue {
  carnet: CarnetView;
  /** Envoie une action au serveur ; renvoie son résultat. Lève une Error au message affichable. */
  act: <T = unknown>(action: string, args?: Record<string, unknown>) => Promise<T>;
  /** Une action est en cours. */
  busy: boolean;
  /** Dernière erreur de communication avec le serveur, effacée par l'action réussie suivante. */
  error: string | null;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}

const CarnetContext = createContext<CarnetContextValue | null>(null);

const ENDPOINT = "/api/carnet";
const TAB_KEY = `${STORAGE_KEY}:onglet`;
const REFRESH_AFTER = 60_000;

async function request<T>(init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, { cache: "no-store", signal: AbortSignal.timeout(15_000), ...init });
  } catch {
    throw new Error("Le serveur du carnet ne répond pas. Tourne-t-il ?");
  }
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? `Erreur ${res.status}`);
  return body as T;
}

function readTab(): TabId {
  try {
    const t = window.localStorage.getItem(TAB_KEY);
    return TABS.some((x) => x.id === t) ? (t as TabId) : "fiche";
  } catch {
    return "fiche";
  }
}

// Rendu uniquement côté client (voir CarnetClient).
export function CarnetProvider({ children }: { children: ReactNode }) {
  const [carnet, setCarnet] = useState<CarnetView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [activeTab, setTab] = useState<TabId>(readTab);
  // Les actions partent une par une, dans l'ordre des clics.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const loadedAt = useRef(0);

  const load = useCallback(
    () =>
      request<CarnetView>().then(
        (view) => {
          loadedAt.current = Date.now();
          setCarnet(view);
          setLoadError(null);
        },
        (e: Error) => setLoadError(e.message),
      ),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    request<CarnetView>().then(
      (view) => {
        if (cancelled) return;
        loadedAt.current = Date.now();
        setCarnet(view);
      },
      (e: Error) => !cancelled && setLoadError(e.message),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Retour sur l'onglet ou nouveau jour : on relit le carnet (quêtes du jour, autre appareil).
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && Date.now() - loadedAt.current > REFRESH_AFTER) void load();
    };
    const id = window.setInterval(refresh, REFRESH_AFTER);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const act = useCallback(<T,>(action: string, args: Record<string, unknown> = {}): Promise<T> => {
    const run = async () => {
      setPending((n) => n + 1);
      try {
        const res = await request<{ result: T; carnet: CarnetView }>({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, args }),
        });
        loadedAt.current = Date.now();
        setCarnet(res.carnet);
        setError(null);
        return res.result;
      } catch (e) {
        setError((e as Error).message);
        throw e;
      } finally {
        setPending((n) => n - 1);
      }
    };
    const next = queue.current.then(run, run);
    queue.current = next.catch(() => {});
    return next;
  }, []);

  const setActiveTab = useCallback((tab: TabId) => {
    setTab(tab);
    try {
      window.localStorage.setItem(TAB_KEY, tab);
    } catch {}
  }, []);

  if (!carnet) {
    return (
      <div className="panel">
        {loadError ? (
          <>
            <p className="empty-log">⚠ {loadError}</p>
            <button type="button" className="roll-btn mt" onClick={() => void load()}>
              Réessayer
            </button>
          </>
        ) : (
          <p className="empty-log">Le carnet s&apos;ouvre...</p>
        )}
      </div>
    );
  }

  return (
    <CarnetContext.Provider value={{ carnet, act, busy: pending > 0, error, activeTab, setActiveTab }}>
      {children}
    </CarnetContext.Provider>
  );
}

export function useCarnet(): CarnetContextValue {
  const ctx = useContext(CarnetContext);
  if (!ctx) throw new Error("useCarnet doit être utilisé dans <CarnetProvider>");
  return ctx;
}

/**
 * Champ texte enregistré après une pause de saisie ou en quittant le champ.
 * Tant que le champ a le focus, la valeur du serveur ne vient pas écraser la saisie.
 */
export function useSavedText(serverValue: string, save: (value: string) => Promise<unknown>) {
  const [value, setValue] = useState(serverValue);
  const latest = useRef(serverValue);
  const dirty = useRef(false);
  const focused = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!focused.current && !dirty.current) {
      setValue(serverValue);
      latest.current = serverValue;
    }
  }, [serverValue]);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    void save(latest.current).catch(() => {});
  }, [save]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return {
    value,
    onChange: (e: { target: { value: string } }) => {
      setValue(e.target.value);
      latest.current = e.target.value;
      dirty.current = true;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 800);
    },
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      flush();
    },
  };
}
