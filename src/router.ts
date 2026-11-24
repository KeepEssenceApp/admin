import { createStore, useStore } from "./store";
import { said } from "./lib";

const here = () => ({ path: location.pathname, search: location.search });
const route = createStore(here());

window.addEventListener("popstate", () => {
  said.set(null);
  route.set(here());
});

export function go(to: string, replace = false) {
  if (to === location.pathname + location.search) return;
  history[replace ? "replaceState" : "pushState"](null, "", to);
  // The sentence about the last action belongs to the page it happened on.
  said.set(null);
  route.set(here());
  window.scrollTo(0, 0);
}

export const useRoute = () => useStore(route);

/** Lets plain <a href> navigate inside the app. */
export function onLinkClick(ev: MouseEvent) {
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  const a = (ev.target as Element | null)?.closest?.("a");
  if (!a || a.target || a.hasAttribute("download")) return;
  const href = a.getAttribute("href");
  if (!href || !href.startsWith("/") || href.startsWith("//")) return;
  ev.preventDefault();
  go(href);
}
