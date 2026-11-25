import { useEffect } from "preact/hooks";
import { checkSession, signedIn } from "./api";
import { Shell, type Entry } from "./components/Shell";
import { Loading } from "./components/ui";
import { t } from "./i18n";
import { AuditPage } from "./pages/Audit";
import { FeedbackPage } from "./pages/Feedback";
import { InvitesPage } from "./pages/Invites";
import { OverviewPage } from "./pages/Overview";
import { SignIn } from "./pages/SignIn";
import { UsagePage } from "./pages/Usage";
import { UserPage } from "./pages/UserDetail";
import { UsersPage } from "./pages/Users";
import { WaitlistPage } from "./pages/Waitlist";
import { onLinkClick, useRoute } from "./router";
import { useStore } from "./store";

function page(path: string): { entry: Entry; title: string; view: preact.ComponentChild } {
  const user = path.match(/^\/users\/([^/]+)\/?$/);
  if (user) return { entry: "users", title: t("nav.users"), view: <UserPage key={user[1]} id={decodeURIComponent(user[1])} /> };
  switch (path.replace(/\/$/, "")) {
    case "/waitlist":
      return { entry: "waitlist", title: t("nav.waitlist"), view: <WaitlistPage /> };
    case "/invites":
      return { entry: "invites", title: t("nav.invites"), view: <InvitesPage /> };
    case "/users":
      return { entry: "users", title: t("nav.users"), view: <UsersPage /> };
    case "/usage":
      return { entry: "usage", title: t("nav.usage"), view: <UsagePage /> };
    case "/feedback":
      return { entry: "feedback", title: t("nav.feedback"), view: <FeedbackPage /> };
    case "/audit":
      return { entry: "audit", title: t("nav.audit"), view: <AuditPage /> };
    default:
      return { entry: "overview", title: t("nav.overview"), view: <OverviewPage /> };
  }
}

export function App() {
  const state = useStore(signedIn);
  const route = useRoute();
  useEffect(() => {
    void checkSession();
  }, []);
  // The sign-in page is always dark; the rest follows the system.
  useEffect(() => {
    if (state === false) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  }, [state]);

  if (state === null) return <div class="wait"><Loading /></div>;
  if (!state) return <SignIn />;
  const { entry, title, view } = page(route.path);
  return (
    <div onClick={onLinkClick}>
      <Shell current={entry} title={title}>
        {view}
      </Shell>
    </div>
  );
}
