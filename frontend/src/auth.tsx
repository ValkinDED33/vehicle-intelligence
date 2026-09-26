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
} from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
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

  const register = useCallback(
    async (input: { email: string; password: string; displayName?: string }) => {
      const response = await authApi.register(input);
      applySession(response.accessToken, response.user);
    },
    [applySession],
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, register, logout }),
    [user, ready, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          : "Не удалось связаться с сервером. Попробуйте ещё раз.",
      );
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError(null);
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
        <h1>{mode === "login" ? "С возвращением!" : "Создайте аккаунт"}</h1>
        <p>
          {mode === "login"
            ? "Войдите, чтобы подключить вашего автомобиля к CARA."
            : "Регистрация занимает меньше минуты."}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => switchMode("login")}
          >
            Вход
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => switchMode("register")}
          >
            Регистрация
          </button>
        </div>

        {mode === "register" && (
          <label className="auth-field">
            <span>Имя</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Как к вам обращаться"
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
            placeholder={mode === "register" ? "Минимум 10 символов" : "Ваш пароль"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="primary auth-submit" type="submit" disabled={busy}>
          {busy
            ? "Подключаемся..."
            : mode === "login"
              ? "ВОЙТИ В ГАРАЖ"
              : "ЗАРЕГИСТРИРОВАТЬСЯ"}
        </button>
        <small className="auth-note">Данные защищены JWT · Vehicle Intelligence API</small>
      </form>
    </div>
  );
}
