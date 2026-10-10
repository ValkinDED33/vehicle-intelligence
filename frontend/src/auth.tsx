import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

  useEffect(() => {
    if (getToken()) setUser(loadStoredUser());
    setReady(true);

    const onUnauthorized = () => setUser(null);
    window.addEventListener("cara:unauthorized", onUnauthorized);
    return () => window.removeEventListener("cara:unauthorized", onUnauthorized);
  }, []);

  const applySession = useCallback((token: string, sessionUser: AuthUser) => {
    saveSession(token, sessionUser);
    setUser(sessionUser);
  }, []);

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
      const response = await authApi.register(input);
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
    : null;

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
          : "Не вдалося з’єднатися із сервером. Спробуйте ще раз.",
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

      setError("Відкрийте сайт через кнопку IA-CARS у Telegram-боті.");
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
          : "Не вдалося увійти через Telegram. Спробуйте ще раз.",
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
        </div>
        <h1>{mode === "login" ? "З поверненням!" : "Створіть обліковий запис"}</h1>
        <p>
          {mode === "login"
            ? "Увійдіть, щоб під’єднати ваш автомобіль до CARA."
            : "Реєстрація займає менше хвилини."}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => switchMode("login")}
          >
            Вхід
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => switchMode("register")}
          >
            Реєстрація
          </button>
        </div>

        <button
          className="telegram-login"
          type="button"
          onClick={submitTelegram}
          disabled={telegramBusy}
        >
          {telegramBusy
            ? "Перевіряємо Telegram..."
            : telegramInitData
              ? "УВІЙТИ ЧЕРЕЗ TELEGRAM"
              : "ВІДКРИТИ ЧЕРЕЗ TELEGRAM"}
        </button>

        <div className="auth-divider">
          <span>або</span>
        </div>

        {mode === "register" && (
          <label className="auth-field">
            <span>Ім’я</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Як до вас звертатися"
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
          <span>Пароль</span>
          <input
            type="password"
            required
            minLength={mode === "register" ? 10 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "register" ? "Мінімум 10 символів" : "Ваш пароль"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="primary auth-submit" type="submit" disabled={busy}>
          {busy
            ? "Під’єднуємося..."
            : mode === "login"
              ? "УВІЙТИ В ГАРАЖ"
              : "ЗАРЕЄСТРУВАТИСЯ"}
        </button>
        <small className="auth-note">Дані захищено JWT · Vehicle Intelligence API</small>
      </form>
    </div>
  );
}
