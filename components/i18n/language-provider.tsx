"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { DEFAULT_LANG, type Lang, type L, pick } from "@/lib/i18n/config";
import { ui, type UIDict } from "@/lib/i18n/dict";

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  /** Shared UI dictionary for the active language. */
  ui: UIDict;
  /** Resolve a translatable { tr, en } value to the active language. */
  t: (value: L) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

/** BIRLESIM_PLANI §1.9 — tüm istemci durumu `sm:` ön ekli, çünkü aynı domaine
 *  kurulmuş başka bir GoatStarter uygulaması da düz "lang" yazıyor. */
const LANG_STORAGE_KEY = "sm:lang";

/** Aynı sekmedeki diğer tüketicileri uyandırmak için — `storage` olayı yalnızca
 *  DİĞER sekmelerde tetiklenir, yazan sekmede tetiklenmez. */
const LANG_EVENT = "sm:lang-change";

/**
 * ⚠ SAPMA (BIRLESIM_PLANI §7.4 "gövdesini değiştirme" kuralından):
 * kaynaktaki `useState` + `useEffect(() => { ...setLangState(saved) }, [])`
 * deseni React 19'un `react-hooks/set-state-in-effect` kuralına takılıyor ve
 * `npm run lint`'i kırıyor. Aynı hata siraya ve threadly'de de var (devralınan
 * borç). localStorage tek gerçek kaynak yapılarak effect'siz karşılığına
 * çevrildi; davranış korunuyor, ek olarak sekmeler arası eşitleme kazanıldı.
 */
function readStoredLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return saved === "tr" || saved === "en" ? saved : DEFAULT_LANG;
  } catch {
    // Private mode / storage kapalı — varsayılana düş, ekranı kırma.
    return DEFAULT_LANG;
  }
}

function subscribeToLang(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(LANG_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LANG_EVENT, onChange);
  };
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(
    subscribeToLang,
    readStoredLang,
    () => DEFAULT_LANG,
  );

  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, l);
    } catch {
      // Yazamadıysak da dili değiştir — sadece kalıcı olmaz.
    }
    document.documentElement.lang = l;
    window.dispatchEvent(new Event(LANG_EVENT));
  }, []);

  const toggle = useCallback(
    () => setLang(lang === "tr" ? "en" : "tr"),
    [lang, setLang],
  );

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang,
      toggle,
      ui: ui[lang],
      t: (v: L) => pick(v, lang),
    }),
    [lang, setLang, toggle],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside <LanguageProvider>");
  return ctx;
}
