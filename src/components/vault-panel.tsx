import { HardDriveDownload, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { isPublicDemo } from "@/lib/demo";
import { useT } from "@/lib/i18n";
import { useGrain } from "@/lib/store";
import { backupNow, countsOf, lastVaultWrite, readVault, restoreFromVault } from "@/lib/vault";
import { Button } from "./ui/button";

/** 「下载到 Mac」面板里的本机备份一栏:显示上次备份、手动备份、手动恢复。 */
export function VaultPanel({ open }: { open: boolean }) {
  const t = useT();
  const lang = useGrain((s) => s.lang);
  const [last, setLast] = useState<{ when: string; lists: number; sources: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<"save" | "restore" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [readonly, setReadonly] = useState(lastVaultWrite()?.reason === "readonly");

  const stamp = (iso: string) =>
    new Date(iso).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  async function refresh() {
    const snap = await readVault();
    if (!snap) {
      setLast(null);
      setLoaded(true);
      return;
    }
    const c = countsOf(snap.state);
    setLast({ when: stamp(snap.savedAt), lists: c.lists, sources: c.sources });
    setLoaded(true);
  }

  useEffect(() => {
    if (!open) return;
    setConfirming(false);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onBackup() {
    setBusy("save");
    const res = await backupNow();
    setBusy(null);
    if (res.ok) {
      setReadonly(false);
      toast.success(t.toastVaultSaved(res.counts.lists, res.counts.sources));
      void refresh();
      return;
    }
    if (res.reason === "blank") {
      toast(t.toastVaultEmpty);
      return;
    }
    setReadonly(res.reason === "readonly");
    toast(t.toastVaultFail);
  }

  async function onRestore() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy("restore");
    const counts = await restoreFromVault();
    setBusy(null);
    if (!counts) {
      toast(t.toastVaultNoBackup);
      return;
    }
    toast.success(t.toastVaultRestored(counts.lists, counts.albums, counts.sources));
  }

  if (isPublicDemo) {
    return (
      <div className="mt-8 rounded-lg bg-raised p-4 shadow-[var(--shadow-border)]">
        <p className="text-sm">{t.vaultTitle}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{t.vaultReadonly}</p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-lg bg-raised p-4 shadow-[var(--shadow-border)]">
      <p className="text-sm">{t.vaultTitle}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{t.vaultDesc}</p>
      <p className="mt-3 text-xs text-subtle">
        {readonly ? t.vaultReadonly : last ? t.vaultLast(last.when, last.lists, last.sources) : loaded ? t.vaultNone : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" className="gap-1.5" disabled={busy !== null} onClick={() => void onBackup()}>
          {busy === "save" ? <LoaderCircle className="size-3.5 animate-spin" /> : <HardDriveDownload className="size-3.5" />}
          {t.vaultBackup}
        </Button>
        <Button
          size="sm"
          variant={confirming ? "default" : "ghost"}
          className="gap-1.5"
          disabled={busy !== null || !last}
          onClick={() => void onRestore()}
        >
          {busy === "restore" ? <LoaderCircle className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
          {confirming ? t.vaultRestoreConfirm : t.vaultRestore}
        </Button>
      </div>
    </div>
  );
}
