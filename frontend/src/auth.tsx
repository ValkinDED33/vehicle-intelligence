import { getUiLanguage, setUiLanguage, t, useUiLanguage } from "./i18n";
import { LanguagePicker } from "./components/LanguagePicker";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  ApiError,
  authApi,
  clearSession,
  getToken,
  loadStoredUser,
  saveSession,
  type AuthUser,
  type UserLanguage,
} from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithTelegram: (initData: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
  updateLanguage: (language: UserLanguage) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const sessionVersion = useRef(0);

  useEffect(() => {
    if (getToken()) {
      const stored = loadStoredUser();
      setUser(stored);
      setUiLanguage(stored?.language);
    } else setUiLanguage(getUiLanguage());
    setReady(true);

    const onUnauthorized = () => setUser(null);
    window.addEventListener("cara:unauthorized", onUnauthorized);
    return () => window.removeEventListener("cara:unauthorized", onUnauthorized);
  }, []);

  const applySession = useCallback((token: string, sessionUser: AuthUser) => {
    sessionVersion.current += 1;
    saveSession(token, sessionUser);
    setUiLanguage(sessionUser.language);
    setUser(sessionUser);
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getToken();
    const version = sessionVersion.current;
    if (!token) return;
    try {
      const freshUser = await authApi.me();
      if (getToken() === token && sessionVersion.current === version) applySession(token, freshUser);
    } catch {
      // Keep the cached profile on network failure; request() handles expired sessions.
    }
  }, [applySession]);

  useEffect(() => {
    void refreshUser();
    const onFocus = () => void refreshUser();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await authApi.login(email, password);
      applySession(response.accessToken, response.user);
    },
    [applySession],
  );

  const loginWithTelegram = useCallback(
    async (initData: string) => {
      const response = await authApi.telegram(initData);
      applySession(response.accessToken, response.user);
    },
    [applySession],
  );

  const register = useCallback(
    async (input: { email: string; password: string; displayName?: string }) => {
      const response = await authApi.register({ ...input, language: getUiLanguage() });
      applySession(response.accessToken, response.user);
    },
    [applySession],
  );

  const updateLanguage = useCallback(
    async (language: UserLanguage) => {
      const response = await authApi.updateProfile({ language });
      applySession(response.accessToken, response.user);
    },
    [applySession],
  );

  const logout = useCallback(() => {
    sessionVersion.current += 1;
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      login,
      loginWithTelegram,
      register,
      updateLanguage,
      logout,
    }),
    [user, ready, login, loginWithTelegram, register, updateLanguage, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export function AuthScreen() {
  const language = useUiLanguage();
  const { login, loginWithTelegram, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const telegramInitData =
    typeof window !== "undefined"
      ? window.Telegram?.WebApp?.initData?.trim() || ""
      : "";

  const telegramBotUsername = (
    import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined
  )?.trim();
  const telegramBotUrl = telegramBotUsername
    ? `https://t.me/${telegramBotUsername.replace(/^@/, "")}`
    : "https://t.me/IACarsBot";

  useEffect(() => {
    window.Telegram?.WebApp?.ready?.();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
        });
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : t("Не вдалося з’єднатися із сервером. Спробуйте ще раз."),
      );
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError(null);
  };

  const submitTelegram = async () => {
    if (telegramBusy) return;

    if (!telegramInitData) {
      if (telegramBotUrl) {
        window.location.href = telegramBotUrl;
        return;
      }

      setError(t("Відкрийте сайт через кнопку IA-CARS у Telegram-боті."));
      return;
    }

    setTelegramBusy(true);
    setError(null);

    try {
      await loginWithTelegram(telegramInitData);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : t("Не вдалося увійти через Telegram. Спробуйте ще раз."),
      );
    } finally {
      setTelegramBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <span className="brand-mark">C</span>
          <div>
            <strong>CARA</strong>
            <small>AI CAR ASSISTANT</small>
          </div>
          <LanguagePicker language={language} onChange={setUiLanguage}/>
        </div>
        <h1>{mode === "login" ? t("З поверненням!") : t("Створіть обліковий запис")}</h1>
        <p>
          {mode === "login"
            ? t("Увійдіть, щоб під’єднати ваш автомобіль до CARA.")
            : t("Реєстрація займає менше хвилини.")}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => switchMode("login")}
          > {t("Вхід")} </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => switchMode("register")}
          > {t("Реєстрація")} </button>
        </div>

        <button
          className="telegram-login"
          type="button"
          onClick={submitTelegram}
          disabled={telegramBusy}
        >
          {telegramBusy
            ? t("Перевіряємо Telegram...")
            : telegramInitData
              ? t("УВІЙТИ ЧЕРЕЗ TELEGRAM")
              : t("ВІДКРИТИ ЧЕРЕЗ TELEGRAM")}
        </button>

        <div className="auth-divider">
          <span>{t("або")}</span>
        </div>

        {mode === "register" && (
          <label className="auth-field">
            <span>{t("Ім’я")}</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("Як до вас звертатися")}
              maxLength={80}
            />
          </label>
        )}
        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>
        <label className="auth-field">
          <span>{t("Пароль")}</span>
          <input
            type="password"
            required
            minLength={mode === "register" ? 10 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "register" ? t("Мінімум 10 символів") : t("Ваш пароль")}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="primary auth-submit" type="submit" disabled={busy}>
          {busy
            ? t("Під’єднуємося...")
            : mode === "login"
              ? t("УВІЙТИ В ГАРАЖ")
              : t("ЗАРЕЄСТРУВАТИСЯ")}
        </button>
        <small className="auth-note">{t("Дані захищено JWT · Vehicle Intelligence API")}</small>
      </form>
    </div>
  );
}
