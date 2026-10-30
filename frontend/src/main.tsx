import { t, useUiLanguage } from "./i18n";
import { createRoot } from "react-dom/client";
import { AuthProvider, AuthScreen, useAuth } from "./auth";
import { Shell } from "./components/Shell";
import { Spinner } from "./components/CommonComponents";
import "./style.css";

function Root() {
  useUiLanguage();
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <div className="boot-screen">
        <span className="brand-mark">C</span>
        <Spinner label={t("Запуск CARA...")} />
      </div>
    );
  }
  if (!user) return <AuthScreen />;
  return <Shell />;
}

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <Root />
  </AuthProvider>,
);

