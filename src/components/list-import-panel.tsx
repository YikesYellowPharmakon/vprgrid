import { LoaderCircle, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { importListFromPaste, importListFromUrl } from "@/lib/catalog/list-import";
import { displayListName, type UserList } from "@/lib/catalog/lists";
import { describeRymUrl } from "@/lib/catalog/sources";
import { useT } from "@/lib/i18n";
import { useGrain } from "@/lib/store";
import { Button } from "./ui/button";

export function ListImportPanel({ list }: { list: UserList }) {
  const t = useT();
  const addManyToList = useGrain((s) => s.addManyToList);
  const [urlInput, setUrlInput] = useState("");
  const [rymUrl, setRymUrl] = useState<string | null>(null);
  const [rymPaste, setRymPaste] = useState("");
  const [albumInput, setAlbumInput] = useState("");
  const [pasteInput, setPasteInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const label = displayListName(list, t.listDefaultName);

  function finish(items: { artist: string; title: string; date?: string; pic?: string | null; key: string }[], nLabel?: string) {
    const { added, skipped } = addManyToList(list.id, items);
    toast(t.toastListImported(added, skipped, nLabel || label));
  }

  async function addFromUrl() {
    const value = urlInput.trim() || rymUrl || "";
    if (!value || busy) return;
    setBusy("url");
    try {
      const res = await importListFromUrl(value);
      if (!res.ok) {
        if (res.error === "spotify") return void toast(t.toastSpotify);
        if (res.error === "unsupported") return void toast(t.toastUnsupportedStream);
        if (res.error === "unknown") return void toast(t.toastUrlUnknown);
        if (res.error === "rym" && res.rymUrl) {
          setRymUrl(res.rymUrl);
          setRymPaste("");
          setUrlInput("");
          return;
        }
        return void toast(res.error, { duration: 8000 });
      }
      finish(res.items, res.label);
      setUrlInput("");
      setRymUrl(null);
    } finally {
      setBusy(null);
    }
  }

  function importRymFromPaste() {
    if (!rymUrl) return;
    const text = rymPaste.trim();
    if (!text) return;
    const res = importListFromPaste(text);
    if (!res.ok) return void toast(t.toastPasteFail);
    finish(res.items, describeRymUrl(rymUrl));
    setRymUrl(null);
    setRymPaste("");
  }

  function addAlbum() {
    const res = importListFromPaste(albumInput);
    if (!res.ok) return void toast(t.toastAlbumParseFail);
    finish(res.items);
    setAlbumInput("");
  }

  function addFromPaste() {
    const res = importListFromPaste(pasteInput);
    if (!res.ok) return void toast(t.toastPasteFail);
    finish(res.items);
    setPasteInput("");
  }

  return (
    <div className="mt-4 rounded-lg bg-raised/60 p-3 shadow-[var(--shadow-border)] sm:p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span>
          <p className="text-xs tracking-[0.18em] text-subtle">{t.listImport}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{t.listImportHint}</p>
        </span>
        <span className="ml-3 text-xs text-accent">{open ? "–" : "+"}</span>
      </button>
      {open ? (
        <div className="mt-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addFromUrl();
            }}
          >
            <p className="text-sm">{t.listAddUrlTitle}</p>
            <p className="mt-1 text-xs leading-relaxed text-subtle">{t.addUrlDesc}</p>
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={t.phUrl}
              autoComplete="off"
              spellCheck={false}
              className="mt-2.5 h-11 w-full rounded-md bg-surface px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" className="mt-2.5" variant="secondary" size="sm" disabled={busy !== null || !urlInput.trim()}>
              {busy === "url" ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {busy === "url" ? t.btnReadingUrl : t.listBtnImportUrl}
            </Button>
          </form>

          {rymUrl ? (
            <div className="mt-4 rounded-lg bg-raised p-4 shadow-[var(--shadow-border)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm">{t.rymPathTitle}</p>
                  <p className="mt-1 text-xs text-subtle tabular-nums">RYM · {describeRymUrl(rymUrl)}</p>
                </div>
                <button type="button" aria-label={t.cancel} onClick={() => setRymUrl(null)} className="shrink-0 text-subtle hover:text-fg">
                  <X className="size-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted">
                <li>{t.rymPathStep1}</li>
                <li>{t.listRymStep2}</li>
              </ol>
              <textarea
                value={rymPaste}
                onChange={(e) => setRymPaste(e.target.value)}
                placeholder={t.phRymPaste}
                rows={4}
                spellCheck={false}
                className="mt-3 w-full rounded-md bg-surface px-3 py-2.5 font-mono text-xs leading-relaxed text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button className="mt-2.5" variant="secondary" size="sm" disabled={!rymPaste.trim()} onClick={importRymFromPaste}>
                {t.listBtnRymParse}
              </Button>
            </div>
          ) : null}

          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              addAlbum();
            }}
          >
            <p className="text-sm">{t.addAlbumTitle}</p>
            <p className="mt-1 text-xs leading-relaxed text-subtle">{t.listAddAlbumDesc}</p>
            <div className="mt-2.5 flex gap-2">
              <input
                value={albumInput}
                onChange={(e) => setAlbumInput(e.target.value)}
                placeholder={t.phAlbum}
                autoComplete="off"
                spellCheck={false}
                className="h-11 min-w-0 flex-1 rounded-md bg-surface px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button type="submit" variant="secondary" size="sm" className="h-11" disabled={!albumInput.trim()}>
                {t.btnAddAlbum}
              </Button>
            </div>
          </form>

          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              addFromPaste();
            }}
          >
            <p className="text-sm">{t.addPasteTitle}</p>
            <p className="mt-1 text-xs leading-relaxed text-subtle">{t.addPasteDesc}</p>
            <textarea
              value={pasteInput}
              onChange={(e) => setPasteInput(e.target.value)}
              placeholder={t.phPasteBody}
              rows={4}
              spellCheck={false}
              className="mt-2.5 w-full rounded-md bg-surface px-3 py-2.5 font-mono text-xs leading-relaxed text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" className="mt-2.5" variant="secondary" size="sm" disabled={!pasteInput.trim()}>
              {t.listBtnParse}
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
