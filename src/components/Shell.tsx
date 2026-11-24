import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { signOut } from "../api";
import { t, type Key } from "../i18n";
import { useRoute } from "../router";
import { Logo, Said } from "./ui";

export type Entry = "overview" | "waitlist" | "invites" | "users" | "usage" | "audit";
const ENTRIES: { id: Entry; href: string; label: Key }[] = [
  { id: "overview", href: "/", label: "nav.overview" },
  { id: "waitlist", href: "/waitlist", label: "nav.waitlist" },
  { id: "invites", href: "/invites", label: "nav.invites" },
  { id: "users", href: "/users", label: "nav.users" },
  { id: "usage", href: "/usage", label: "nav.usage" },
  { id: "audit", href: "/audit", label: "nav.audit" },
];

/**
 * Seven entries in a fixed order (six pages, then Sign out): a left rail on wide screens,
 * a bar with a menu at the top on phones.
 */
export function Shell({ current, title, children }: { current: Entry; title: string; children: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  const route = useRoute();
  useEffect(() => setOpen(false), [route.path]);
  return (
    <div class="shell">
      <nav class={`nav${open ? " open" : ""}`} aria-label={t("nav.label")}>
        <div class="nav-top">
          <a class="nav-logo" href="/" aria-label={`KeepEssence ${t("nav.name")}`}>
            <Logo size={28} />
            <span>{t("nav.name")}</span>
          </a>
          <button class="btn quiet small nav-menu" type="button" aria-expanded={open} aria-controls="nav-entries" onClick={() => setOpen(!open)}>
            {t("nav.menu")}
          </button>
        </div>
        <div class="nav-entries" id="nav-entries">
          {ENTRIES.map((e) => (
            <a key={e.id} class="nav-entry" href={e.href} aria-current={e.id === current ? "page" : undefined} data-entry={e.id}>
              {t(e.label)}
            </a>
          ))}
          <button class="nav-entry nav-out" type="button" data-entry="signout" onClick={() => void signOut()}>
            {t("nav.signout")}
          </button>
        </div>
      </nav>
      <main class="main">
        <h1>{title}</h1>
        <Said />
        {children}
      </main>
    </div>
  );
}
