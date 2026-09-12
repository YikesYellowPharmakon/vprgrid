import { Bookmark, LoaderCircle, Plus, Sparkles, Trash2 } from "lucide-react";
import { startTransition, useState } from "react";
import { toast } from "sonner";
import { ALL_TASTE, tastePreset } from "@/lib/catalog/genres";
import { mergeSourceEntries } from "@/lib/catalog/sources";
import { analyzeTaste, type TasteNote } from "@/lib/catalog/taste-ai";
import { useT } from "@/lib/i18n";
import { useGrain, useTaxonomy } from "@/lib/store";
import { cn } from "@/lib/utils";
import { aiOverrideOf } from "./ai-sheet";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Sheet, SheetContent } from "./ui/sheet";

export function TasteSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const taste = useGrain((s) => s.taste);
  const toggleTaste = useGrain((s) => s.toggleTaste);
  const toggleFamily = useGrain((s) => s.toggleFamily);
  const setTaste = useGrain((s) => s.setTaste);
  const addCustomFamily = useGrain((s) => s.addCustomFamily);
  const addCustomGenre = useGrain((s) => s.addCustomGenre);
  const removeCustomFamily = useGrain((s) => s.removeCustomFamily);
  const removeCustomGenre = useGrain((s) => s.removeCustomGenre);
  const tastePresets = useGrain((s) => s.tastePresets);
  const saveTastePreset = useGrain((s) => s.saveTastePreset);
  const applyTastePreset = useGrain((s) => s.applyTastePreset);
  const removeTastePreset = useGrain((s) => s.removeTastePreset);
  const refSources = useGrain((s) => s.refSources);
  const aiConf = useGrain((s) => s.aiConf);
  const { families, genres, letters } = useTaxonomy();
  const t = useT();
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<TasteNote | null>(null);
  const [addingFamily, setAddingFamily] = useState(false);
  const [addingChild, setAddingChild] = useState<string | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [familyLabel, setFamilyLabel] = useState("");
  const [familyZh, setFamilyZh] = useState("");
  const [childLabel, setChildLabel] = useState("");
  const [childZh, setChildZh] = useState("");
  const [childSyn, setChildSyn] = useState("");

  /** AI 口味画像:把参考池样本 + 当前风格勾选喂给模型,产出取向分析与增删建议。 */
  async function runAiTaste() {
    if (aiBusy) return;
    setAiBusy(true);
    try {
      const entries = mergeSourceEntries(refSources.filter((s) => s.enabled));
      const counts = new Map<string, number>();
      for (const e of entries) counts.set(e.artist, (counts.get(e.artist) ?? 0) + 1);
      const topArtists = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([a, n]) => `${a} ×${n}`);
      // 均匀采样整个参考池,避免只看到最前面的条目
      const step = Math.max(1, Math.floor(entries.length / 120));
      const refSample = entries
        .filter((_, i) => i % step === 0)
        .slice(0, 120)
        .map((e) => `${e.artist} - ${e.title}${e.date ? ` (${e.date.slice(0, 4)})` : ""}`);
      const on = new Set(taste);
      const line = (g: { id: string; label: string }) => `${g.id}|${g.label}`;
      const res = await analyzeTaste({
        data: {
          genresOn: genres.filter((g) => on.has(g.id)).map(line).slice(0, 400),
          candidates: genres.filter((g) => !on.has(g.id)).map(line).slice(0, 400),
          topArtists,
          refSample,
          ai: aiOverrideOf(aiConf),
        },
      });
      if (!res.ok) {
        toast(res.error);
        return;
      }
      setAiNote(res.note);
    } catch {
      toast(t.toastAiTasteFail);
    } finally {
      setAiBusy(false);
    }
  }

  /** 一键应用 AI 建议:开启 enable、关闭 disable。 */
  function applyAiTaste() {
    if (!aiNote) return;
    const next = new Set(taste);
    for (const id of aiNote.enable) next.add(id);
    for (const id of aiNote.disable) next.delete(id);
    startTransition(() => setTaste([...next]));
    toast(t.toastAiApplied(aiNote.enable.length, aiNote.disable.length));
  }

  const genreLabel = (id: string) => genres.find((g) => g.id === id)?.label ?? id;

  const tasteKey = [...taste].sort().join("|");
  /** 当前勾选正好等于某份存档时,把那枚标签点亮。 */
  const presetActive = (ids: string[]) => ids.length === taste.length && [...ids].sort().join("|") === tasteKey;
  const matchedPreset = tastePresets.find((p) => presetActive(p.ids));
  const unsaved = taste.length > 0 && !matchedPreset;
  const defaultPresetName = () => {
    const d = new Date();
    return `自定义 ${d.getMonth() + 1}/${d.getDate()}`;
  };

  function jump(letter: string) {
    const family = families.find((f) => f.letter === letter);
    if (!family) return;
    document.getElementById(`taste-${family.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function submitFamily() {
    const id = addCustomFamily(familyLabel, familyZh);
    if (!id) {
      toast(t.toastFamilyInvalid);
      return;
    }
    setFamilyLabel("");
    setFamilyZh("");
    setAddingFamily(false);
    toast(t.toastFamilyAdded);
  }

  /** 存一份口味:没起名就用当天日期;同名视为覆盖。 */
  function submitPreset() {
    const name = presetName.trim() || defaultPresetName();
    const dup = tastePresets.some((p) => p.name.trim().toLowerCase() === name.toLowerCase());
    const id = saveTastePreset(name);
    if (!id) {
      toast(taste.length === 0 ? t.toastPresetEmpty : t.toastPresetInvalid);
      return;
    }
    setPresetName("");
    setSavingPreset(false);
    toast(dup ? t.toastPresetUpdated(taste.length) : t.toastPresetSaved(taste.length));
  }

  function submitChild(parentId: string) {
    const synonyms = childSyn.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    const id = addCustomGenre(parentId, childLabel, childZh, synonyms);
    if (!id) {
      toast(t.toastChildInvalid);
      return;
    }
    setChildLabel("");
    setChildZh("");
    setChildSyn("");
    setAddingChild(null);
    toast(t.toastChildAdded);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={t.tasteTitle} className="sm:max-w-xl">
        <ScrollArea className="h-full">
          <div className="px-5 py-8 sm:px-7">
            <p className="text-[11px] tracking-[0.28em] text-muted">TAXONOMY A–Z</p>
            <h2 className="font-display mt-1 text-2xl">{t.tasteHeading}</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={tastePreset(taste) === "all" ? "default" : "secondary"}
                onClick={() =>
                  startTransition(() =>
                    setTaste([...new Set([...ALL_TASTE, ...genres.filter((g) => g.custom).map((g) => g.id)])]),
                  )
                }
              >
                {t.selectAllGenres(genres.length)}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => startTransition(() => setTaste([]))}>
                {t.clearAll}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingFamily((v) => !v)}>
                <Plus className="size-3.5" />
                {t.addFamily}
              </Button>
              <span className="self-center text-xs text-subtle tabular-nums">
                {taste.length}/{genres.length}
              </span>
            </div>

            {/* 存下来的口味:一套勾选存一份,随时切回去 */}
            <div className="mt-5 rounded-lg bg-raised p-4 shadow-[var(--shadow-border)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm">{t.presetTitle}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{t.presetDesc}</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0 gap-1.5"
                  onClick={() => {
                    setPresetName(matchedPreset?.name ?? defaultPresetName());
                    setSavingPreset((v) => !v);
                  }}
                >
                  <Bookmark className="size-3.5" />
                  {t.presetSave}
                </Button>
              </div>
              {unsaved && !savingPreset ? <p className="mt-2 text-xs text-accent">{t.presetUnsaved}</p> : null}
              {savingPreset ? (
                <form
                  className="mt-3 flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitPreset();
                  }}
                >
                  <input
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder={t.phPresetName}
                    autoComplete="off"
                    className="h-11 min-w-40 flex-1 rounded-md bg-surface px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <Button type="submit" size="sm">
                    {t.submitPreset}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSavingPreset(false)}>
                    {t.cancel}
                  </Button>
                </form>
              ) : null}
              {tastePresets.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tastePresets.map((p) => {
                    const on = presetActive(p.ids);
                    return (
                      <span key={p.id} className="inline-flex items-center">
                        <button
                          type="button"
                          title={t.presetTip(p.ids.length, p.savedAt.slice(0, 10))}
                          onClick={() => startTransition(() => applyTastePreset(p.id))}
                          className={cn(
                            "inline-flex h-9 items-center gap-1.5 rounded-full rounded-r-none pr-2 pl-3 text-xs tracking-wide transition-colors",
                            on ? "bg-accent text-accent-foreground" : "bg-surface text-muted hover:text-fg",
                          )}
                        >
                          {p.name}
                          <span className={cn("text-[10px] tabular-nums", on ? "opacity-70" : "text-subtle")}>
                            {p.ids.length}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`${t.ariaDelPreset} ${p.name}`}
                          onClick={() => removeTastePreset(p.id)}
                          className={cn(
                            "flex h-9 items-center rounded-r-full pr-2.5 pl-1 text-xs",
                            on ? "bg-accent text-accent-foreground" : "bg-surface text-muted hover:text-danger",
                          )}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* AI 口味画像 */}
            <div className="mt-5 rounded-lg bg-raised p-4 shadow-[var(--shadow-border)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm">{t.aiTasteTitle}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{t.aiTasteDesc}</p>
                </div>
                <Button size="sm" variant="secondary" className="shrink-0 gap-1.5" disabled={aiBusy} onClick={() => void runAiTaste()}>
                  {aiBusy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  {aiBusy ? t.aiTasteBusy : t.btnAiTaste}
                </Button>
              </div>
              {aiNote ? (
                <div className="mt-4 space-y-3">
                  {aiNote.profile ? <p className="text-sm leading-relaxed">{aiNote.profile}</p> : null}
                  {aiNote.keywords.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {aiNote.keywords.map((k) => (
                        <span key={k} className="rounded-full bg-surface px-2.5 py-1 text-[11px] text-muted shadow-[var(--shadow-border)]">
                          {k}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {aiNote.enable.length ? (
                    <div>
                      <p className="text-[11px] tracking-[0.22em] text-subtle">{t.aiEnable}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {aiNote.enable.map((id) => (
                          <span key={id} className="rounded-full bg-accent/12 px-2.5 py-1 text-[11px] text-fg shadow-[var(--shadow-border)]">
                            + {genreLabel(id)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {aiNote.disable.length ? (
                    <div>
                      <p className="text-[11px] tracking-[0.22em] text-subtle">{t.aiDisable}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {aiNote.disable.map((id) => (
                          <span key={id} className="rounded-full bg-surface px-2.5 py-1 text-[11px] text-muted line-through shadow-[var(--shadow-border)]">
                            {genreLabel(id)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {aiNote.artists.length ? (
                    <div>
                      <p className="text-[11px] tracking-[0.22em] text-subtle">{t.aiArtists}</p>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted">{aiNote.artists.join(" · ")}</p>
                      <p className="mt-1 text-[11px] text-subtle">{t.aiArtistsHint}</p>
                    </div>
                  ) : null}
                  {aiNote.enable.length || aiNote.disable.length ? (
                    <Button size="sm" onClick={applyAiTaste}>
                      {t.btnApplyAi(aiNote.enable.length, aiNote.disable.length)}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {addingFamily ? (
              <form
                className="mt-4 space-y-2 rounded-md bg-raised p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitFamily();
                }}
              >
                <p className="text-[11px] tracking-[0.22em] text-subtle">{t.newFamily}</p>
                <input
                  value={familyLabel}
                  onChange={(e) => setFamilyLabel(e.target.value)}
                  placeholder={t.phFamilyEn}
                  autoComplete="off"
                  className="h-11 w-full rounded-md bg-surface px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
                />
                <input
                  value={familyZh}
                  onChange={(e) => setFamilyZh(e.target.value)}
                  placeholder={t.phZhOptional}
                  autoComplete="off"
                  className="h-11 w-full rounded-md bg-surface px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    {t.submitFamily}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAddingFamily(false)}>
                    {t.cancel}
                  </Button>
                </div>
              </form>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-1">
              {letters.map((letter) => (
                <button
                  key={letter}
                  type="button"
                  onClick={() => jump(letter)}
                  className="flex size-9 items-center justify-center rounded-sm bg-raised text-xs tracking-wide text-muted hover:text-fg"
                >
                  {letter}
                </button>
              ))}
            </div>

            <div className="mt-8 space-y-10">
              {families.map((family) => {
                const state = family.children.length
                  ? family.children.every((c) => taste.includes(c.id))
                    ? "all"
                    : family.children.some((c) => taste.includes(c.id))
                      ? "some"
                      : "none"
                  : "none";
                const onCount = family.children.filter((c) => taste.includes(c.id)).length;
                return (
                  <section key={family.id} id={`taste-${family.id}`} className="scroll-mt-4">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-display text-subtle w-5 text-sm italic">{family.letter}</span>
                      <span className="text-[11px] tracking-[0.22em] text-subtle">{t.familyWord}</span>
                      {family.custom ? <span className="text-[10px] tracking-wide text-subtle">{t.customMark}</span> : null}
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <div>
                        <h3 className="font-display text-lg leading-tight">{family.label}</h3>
                        <p className="text-xs text-subtle">
                          {family.zh || t.customWord} · {t.genresCount(onCount, family.children.length)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {family.custom ? (
                          <button
                            type="button"
                            aria-label={t.ariaDelFamily}
                            onClick={() => removeCustomFamily(family.id)}
                            className="flex size-9 items-center justify-center text-muted hover:text-danger"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => toggleFamily(family.children.map((c) => c.id))}
                          className="h-9 shrink-0 text-xs text-muted hover:text-fg"
                          disabled={family.children.length === 0}
                        >
                          {state === "all" ? t.deselectFamily : t.selectFamily}
                        </button>
                      </div>
                    </div>
                    <p className="mt-4 mb-2 text-[11px] tracking-[0.22em] text-subtle">{t.childrenAZ}</p>
                    <div className="border-border flex flex-wrap gap-1.5 border-l pl-3">
                      {family.children.map((g) => {
                        const on = taste.includes(g.id);
                        return (
                          <span key={g.id} className="inline-flex items-center">
                            <button
                              type="button"
                              title={g.canonical ? `${g.label} · ${t.initialTaste} · ${g.zh}` : `${g.label} · ${g.zh}`}
                              onClick={() => toggleTaste(g.id)}
                              className={cn(
                                "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs tracking-wide transition-colors",
                                g.custom ? "rounded-r-none" : "",
                                on ? "bg-accent text-accent-foreground" : "bg-raised text-muted hover:text-fg",
                              )}
                            >
                              {g.label}
                              {g.custom ? (
                                <span className={cn("text-[10px] tracking-wide", on ? "opacity-70" : "text-subtle")}>
                                  {t.customMark}
                                </span>
                              ) : null}
                            </button>
                            {g.custom ? (
                              <button
                                type="button"
                                aria-label={`${t.ariaDelFamily} ${g.label}`}
                                onClick={() => removeCustomGenre(g.id)}
                                className={cn(
                                  "flex h-9 items-center rounded-r-full pr-2.5 pl-1 text-xs",
                                  on ? "bg-accent text-accent-foreground" : "bg-raised text-muted hover:text-danger",
                                )}
                              >
                                <Trash2 className="size-3" />
                              </button>
                            ) : null}
                          </span>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          setAddingChild(addingChild === family.id ? null : family.id);
                          setChildLabel("");
                          setChildZh("");
                          setChildSyn("");
                        }}
                        className="inline-flex h-9 items-center gap-1 rounded-full bg-raised px-3 text-xs text-muted hover:text-fg"
                      >
                        <Plus className="size-3" />
                        {t.addChild}
                      </button>
                    </div>
                    {addingChild === family.id ? (
                      <form
                        className="mt-3 space-y-2 rounded-md bg-raised p-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          submitChild(family.id);
                        }}
                      >
                        <input
                          value={childLabel}
                          onChange={(e) => setChildLabel(e.target.value)}
                          placeholder={t.phChildEn}
                          autoComplete="off"
                          className="h-11 w-full rounded-md bg-surface px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <input
                          value={childZh}
                          onChange={(e) => setChildZh(e.target.value)}
                          placeholder={t.phZhOptional}
                          autoComplete="off"
                          className="h-11 w-full rounded-md bg-surface px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <input
                          value={childSyn}
                          onChange={(e) => setChildSyn(e.target.value)}
                          placeholder={t.phSynonyms}
                          autoComplete="off"
                          className="h-11 w-full rounded-md bg-surface px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <div className="flex gap-2">
                          <Button type="submit" size="sm">
                            {t.submitChild}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setAddingChild(null)}>
                            {t.cancel}
                          </Button>
                        </div>
                      </form>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
