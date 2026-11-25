import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { t } from "../i18n";
import { said } from "../lib";
import { useStore } from "../store";

/** The brand mark, from the brand's own files: black on light, white on dark (the style sheet
    shows the one that fits the theme). `size` is its height; under 28 it is the small variant.
    Its dot is the only gold in the portal. */
export function Logo({ size = 28 }: { size?: number }) {
  const width = Math.round((size * 720) / 644);
  const small = size < 28 ? "-small" : "";
  return (
    <span class="logo" role="img" aria-label="KeepEssence">
      <img class="logo-on-light" src={`/icons/mark${small}-black.svg`} alt="" width={width} height={size} />
      <img class="logo-on-dark" src={`/icons/mark${small}-white.svg`} alt="" width={width} height={size} />
    </span>
  );
}

export type DotKind = "solid" | "ring" | "danger";
/** A state is a dot plus words, never a chip. */
export function State({ dot, children, bad }: { dot: DotKind; children?: ComponentChildren; bad?: boolean }) {
  return (
    <span class={`state${bad ? " bad" : ""}`} data-dot={dot}>
      <i class={`dot ${dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/** A dialog: centred on wide screens, at the bottom on phones. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.activeElement as HTMLElement | null;
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, []);
  return (
    <div class="scrim" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div class="sheet-head">
          <h2>{title}</h2>
          <button class="btn quiet small" type="button" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** The one sentence said after an action. */
export function Said() {
  const s = useStore(said);
  if (!s) return null;
  return (
    <p class={`said${s.bad ? " bad" : ""}`} role="status" aria-live="polite" data-testid="said">
      {s.text}
    </p>
  );
}

export function Loading({ error }: { error?: string | null }) {
  return error ? <p class="sentence bad" role="alert">{error}</p> : <p class="sentence quiet" aria-busy="true">{t("common.loading")}</p>;
}

/** A table that scrolls sideways on its own when the screen is narrow. */
export function Table({ children, label, wide }: { children: ComponentChildren; label: string; wide?: boolean }) {
  return (
    <div class="table-wrap" role="region" aria-label={label} tabIndex={0}>
      <table class={wide ? "wide" : undefined}>{children}</table>
    </div>
  );
}

export function Segments<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (next: T) => void; label: string }) {
  return (
    <div class="segments" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
