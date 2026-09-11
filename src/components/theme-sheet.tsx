import { Check, RotateCcw } from "lucide-react";
import { DEFAULT_CUSTOM, THEMES, type CustomTheme } from "@/lib/themes";
import { THEME_NOTES_EN, useT } from "@/lib/i18n";
import { useGrain } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Sheet, SheetContent } from "./ui/sheet";

const TEXTURE_IDS: Array<CustomTheme["texture"]> = ["none", "grain", "grid", "glow"];

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md bg-raised px-3 py-2.5 shadow-[var(--shadow-border)]">
      <span className="text-sm text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-xs text-subtle tabular-nums uppercase">{value}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-8 shrink-0 cursor-pointer rounded-sm border-0 bg-transparent p-0"
          aria-label={label}
        />
      </span>
    </label>
  );
}

export function ThemeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const theme = useGrain((s) => s.theme);
  const setTheme = useGrain((s) => s.setTheme);
  const customTheme = useGrain((s) => s.customTheme);
  const setCustomTheme = useGrain((s) => s.setCustomTheme);
  const lang = useGrain((s) => s.lang);
  const t = useT();

  /** 编辑任何自定义项时自动切到自定义主题,让改动立刻可见。 */
  function edit(patch: Partial<CustomTheme>) {
    setCustomTheme(patch);
    if (theme !== "custom") setTheme("custom");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={t.themeTitle}>
        <ScrollArea className="h-full">
          <div className="px-5 py-8 sm:px-7">
            <h2 className="font-display text-2xl">{t.themeTitle}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{t.themeDesc}</p>
            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {THEMES.map((th) => {
                const on = theme === th.id;
                const swatch =
                  th.id === "custom" ? [customTheme.bg, customTheme.fg, customTheme.accent] : th.swatch;
                return (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => setTheme(th.id)}
                    className={cn(
                      "rounded-md bg-raised px-4 py-3.5 text-left shadow-[var(--shadow-border)] transition-shadow",
                      on ? "shadow-[var(--shadow-border-hover)]" : "hover:shadow-[var(--shadow-border-hover)]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1">
                        {swatch.map((c, i) => (
                          <span
                            key={i}
                            className="size-3.5 rounded-full outline outline-1 -outline-offset-1 outline-fg/20"
                            style={{ background: c }}
                          />
                        ))}
                      </span>
                      {on ? <Check className="size-4 text-accent" /> : null}
                    </div>
                    <p className="font-display mt-2 text-base leading-tight">
                      {th.id === "custom" && lang === "en" ? "Custom" : th.label}
                    </p>
                    <p className="mt-0.5 text-xs text-subtle">
                      {lang === "en" ? (THEME_NOTES_EN[th.id] ?? th.note) : th.note}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-8">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-lg">{t.customPalette}</h3>
                <button
                  type="button"
                  onClick={() => setCustomTheme(DEFAULT_CUSTOM)}
                  className="flex items-center gap-1 text-xs text-muted hover:text-fg"
                >
                  <RotateCcw className="size-3" />
                  {t.reset}
                </button>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t.customDesc}</p>
              <div className="mt-4 space-y-2">
                <ColorField label={t.cfBg} value={customTheme.bg} onChange={(v) => edit({ bg: v })} />
                <ColorField label={t.cfFg} value={customTheme.fg} onChange={(v) => edit({ fg: v })} />
                <ColorField label={t.cfAccent} value={customTheme.accent} onChange={(v) => edit({ accent: v })} />
              </div>
              <div className="mt-3">
                <p className="text-xs tracking-wide text-subtle uppercase">{t.bgImage}</p>
                <input
                  type="url"
                  value={customTheme.image}
                  onChange={(e) => edit({ image: e.target.value.trim() })}
                  placeholder={t.phBgImage}
                  className="mt-1.5 h-10 w-full rounded-md bg-raised px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="mt-3">
                <p className="text-xs tracking-wide text-subtle uppercase">{t.texture}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {TEXTURE_IDS.map((tx) => (
                    <Button
                      key={tx}
                      size="sm"
                      variant={customTheme.texture === tx ? "default" : "secondary"}
                      onClick={() => edit({ texture: tx })}
                    >
                      {t.textures[tx]}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
