import { Check, LayoutGrid } from "lucide-react";
import type { AlbumSnap } from "@/lib/catalog/lists";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BatchAddToListMenu } from "./add-to-list-menu";

export function ListSelectBar({
  total,
  selected,
  albums,
  excludeListId,
  onSelectAll,
  onClear,
  onWall,
}: {
  total: number;
  selected: number;
  albums: AlbumSnap[];
  excludeListId?: string;
  onSelectAll: () => void;
  onClear: () => void;
  /** 打开专辑墙:有勾选就只用勾选的那些。 */
  onWall: () => void;
}) {
  const t = useT();
  if (total === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={selected === total ? onClear : onSelectAll}
        className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2 text-xs text-muted hover:bg-raised hover:text-fg"
      >
        <span
          className={cn(
            "inline-flex size-4 items-center justify-center rounded-sm shadow-[var(--shadow-border)]",
            selected === total && "bg-accent text-accent-foreground",
          )}
        >
          {selected === total ? <Check className="size-3" /> : null}
        </span>
        {selected === total ? t.listClearSel : t.listSelectAll}
      </button>
      <button
        type="button"
        onClick={onWall}
        className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2 text-xs text-muted hover:bg-raised hover:text-fg"
      >
        <LayoutGrid className="size-3.5" />
        {t.listWall}
        {selected > 0 ? ` · ${selected}` : ""}
      </button>
      {selected > 0 ? (
        <>
          <span className="text-xs text-subtle">{t.listSelected(selected)}</span>
          <BatchAddToListMenu albums={albums} excludeListId={excludeListId} onDone={onClear} />
          <button type="button" onClick={onClear} className="h-8 rounded-sm px-2 text-xs text-muted hover:bg-raised hover:text-fg">
            {t.listClearSel}
          </button>
        </>
      ) : (
        <p className="text-xs text-subtle">{t.listSelectHint}</p>
      )}
    </div>
  );
}
