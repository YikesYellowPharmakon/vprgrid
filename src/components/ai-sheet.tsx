import { LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { testAi } from "@/lib/catalog/ai-shared";
import { useT } from "@/lib/i18n";
import { useGrain } from "@/lib/store";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Sheet, SheetContent } from "./ui/sheet";

/** 把 store 里的 AI 自设配置转成调用时的 override(全空则不传)。 */
export function aiOverrideOf(conf: { apiKey: string; baseUrl: string; model: string }) {
  return conf.apiKey.trim() || conf.baseUrl.trim() || conf.model.trim()
    ? { apiKey: conf.apiKey.trim(), baseUrl: conf.baseUrl.trim(), model: conf.model.trim() }
    : undefined;
}

export function AiSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const aiConf = useGrain((s) => s.aiConf);
  const setAiConf = useGrain((s) => s.setAiConf);
  const t = useT();
  const [testing, setTesting] = useState(false);

  async function runTest() {
    if (testing) return;
    setTesting(true);
    try {
      const res = await testAi({ data: { ai: aiOverrideOf(aiConf) ?? {} } });
      if (res.ok) toast(t.aiTestOk(res.model));
      else if (res.error === "no-key") toast(t.aiTestNoKey);
      else toast(t.aiTestFail(res.error), { duration: 9000 });
    } catch {
      toast(t.aiTestFail("network"));
    } finally {
      setTesting(false);
    }
  }

  const inputCls =
    "mt-1.5 w-full rounded-md bg-surface px-3 py-2.5 font-mono text-xs text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={t.aiSheetTitle} className="sm:max-w-lg">
        <ScrollArea className="h-full">
          <div className="px-5 py-8 sm:px-7">
            <p className="text-[11px] tracking-[0.28em] text-muted">AI · BYOK</p>
            <h2 className="font-display mt-1 flex items-center gap-2 text-2xl">
              <Sparkles className="size-5" />
              {t.aiSheetTitle}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">{t.aiSheetDesc}</p>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-xs text-subtle">{t.aiKeyLabel}</span>
                <input
                  type="password"
                  value={aiConf.apiKey}
                  onChange={(e) => setAiConf({ apiKey: e.target.value })}
                  placeholder={t.phAiKey}
                  autoComplete="off"
                  spellCheck={false}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="text-xs text-subtle">{t.aiBaseLabel}</span>
                <input
                  value={aiConf.baseUrl}
                  onChange={(e) => setAiConf({ baseUrl: e.target.value })}
                  placeholder={t.phAiBase}
                  autoComplete="off"
                  spellCheck={false}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="text-xs text-subtle">{t.aiModelLabel}</span>
                <input
                  value={aiConf.model}
                  onChange={(e) => setAiConf({ model: e.target.value })}
                  placeholder={t.phAiModel}
                  autoComplete="off"
                  spellCheck={false}
                  className={inputCls}
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" className="gap-1.5" disabled={testing} onClick={() => void runTest()}>
                {testing ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                {testing ? t.aiTesting : t.btnAiTest}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAiConf({ apiKey: "", baseUrl: "", model: "" });
                  toast(t.toastAiCleared);
                }}
              >
                {t.btnAiClear}
              </Button>
            </div>

            <div className="mt-6 rounded-lg bg-raised p-4 text-xs leading-relaxed text-muted shadow-[var(--shadow-border)]">
              <p>{t.aiSheetNote1}</p>
              <p className="mt-2">{t.aiSheetNote2}</p>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
