import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Check, ListPlus, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { albumToListItem, displayListName, listHasAlbum, type AlbumSnap } from "@/lib/catalog/lists";
import { useT } from "@/lib/i18n";
import { useGrain } from "@/lib/store";
import { cn } from "@/lib/utils";

export function AddToListMenu({
  album,
  className,
  triggerClassName,
  hoverReveal = false,
  children,
}: {
  album: AlbumSnap;
  className?: string;
  triggerClassName?: string;
  hoverReveal?: boolean;
  children?: ReactNode;
}) {
  const t = useT();
  const userLists = useGrain((s) => s.userLists);
  const addToList = useGrain((s) => s.addToList);
  const removeFromList = useGrain((s) => s.removeFromList);
  const createList = useGrain((s) => s.createList);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  function toggle(listId: string, listName: string) {
    const list = userLists.find((l) => l.id === listId);
    const item = albumToListItem(album);
    if (listHasAlbum(list, album) && item) {
      removeFromList(listId, item.key);
      toast(t.removedFromList(album.title, listName));
      return;
    }
    const ok = addToList(listId, album);
    toast(ok ? t.addedToList(album.title, listName) : t.toastListDup);
  }

  function makeAndAdd() {
    const id = createList(name);
    if (!id) return;
    addToList(id, album);
    toast(t.addedToList(album.title, name.trim()));
    setName("");
    setCreating(false);
  }

  return (
    <Dropdown.Root onOpenChange={(open) => !open && setCreating(false)}>
      <Dropdown.Trigger asChild>
        <button
          type="button"
          aria-label={t.ariaAddToList}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center justify-center rounded-sm text-muted hover:bg-raised hover:text-fg",
            hoverReveal && "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
            triggerClassName,
            className,
          )}
        >
          {children ?? <ListPlus className="size-4" />}
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={6}
          onClick={(e) => e.stopPropagation()}
          className="z-50 min-w-48 rounded-lg bg-surface p-1 text-fg shadow-[var(--shadow-border)]"
        >
          <p className="px-2 py-1.5 text-[11px] tracking-wide text-subtle">{t.addToList}</p>
          {userLists.map((list) => {
            const on = listHasAlbum(list, album);
            const label = displayListName(list, t.listDefaultName);
            return (
              <Dropdown.Item
                key={list.id}
                onSelect={(e) => {
                  e.preventDefault();
                  toggle(list.id, label);
                }}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-2 text-sm outline-none hover:bg-raised"
              >
                <span className="min-w-0 truncate">{label}</span>
                {on ? <Check className="size-3.5 shrink-0 text-accent" /> : null}
              </Dropdown.Item>
            );
          })}
          <Dropdown.Separator className="my-1 h-px bg-border" />
          {creating ? (
            <div className="flex items-center gap-1 px-1 py-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.listNewPlaceholder}
                autoFocus
                className="h-8 min-w-0 flex-1 rounded-sm bg-raised px-2 text-xs text-fg outline-none placeholder:text-subtle"
                onKeyDown={(e) => {
                  if (e.key === "Enter") makeAndAdd();
                }}
              />
              <button type="button" onClick={makeAndAdd} className="h-8 rounded-sm px-2 text-xs text-accent hover:bg-raised">
                {t.listCreateAdd}
              </button>
            </div>
          ) : (
            <Dropdown.Item
              onSelect={(e) => {
                e.preventDefault();
                setCreating(true);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none hover:bg-raised"
            >
              <Plus className="size-3.5" />
              {t.listNew}
            </Dropdown.Item>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

export function BatchAddToListMenu({
  albums,
  excludeListId,
  onDone,
  children,
}: {
  albums: AlbumSnap[];
  excludeListId?: string;
  onDone?: () => void;
  children?: ReactNode;
}) {
  const t = useT();
  const userLists = useGrain((s) => s.userLists);
  const addManyToList = useGrain((s) => s.addManyToList);
  const createList = useGrain((s) => s.createList);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const items = albums.map(albumToListItem).filter((x): x is NonNullable<typeof x> => Boolean(x));
  const targets = userLists.filter((l) => l.id !== excludeListId);

  function send(listId: string, listName: string) {
    if (!items.length) return;
    const { added, skipped } = addManyToList(listId, items);
    toast(t.toastListImported(added, skipped, listName));
    setCreating(false);
    setName("");
    onDone?.();
  }

  function makeAndAdd() {
    const id = createList(name);
    if (!id) return;
    send(id, name.trim());
  }

  return (
    <Dropdown.Root onOpenChange={(open) => !open && setCreating(false)}>
      <Dropdown.Trigger asChild>
        <button
          type="button"
          disabled={!items.length}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-surface px-2.5 text-xs text-fg shadow-[var(--shadow-border)] hover:bg-raised disabled:opacity-40"
        >
          {children ?? (
            <>
              <ListPlus className="size-3.5" />
              {t.listBatchAdd}
            </>
          )}
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-48 rounded-lg bg-surface p-1 text-fg shadow-[var(--shadow-border)]"
        >
          <p className="px-2 py-1.5 text-[11px] tracking-wide text-subtle">{t.listBatchAdd}</p>
          {targets.map((list) => {
            const label = displayListName(list, t.listDefaultName);
            return (
              <Dropdown.Item
                key={list.id}
                onSelect={() => send(list.id, label)}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-2 text-sm outline-none hover:bg-raised"
              >
                <span className="min-w-0 truncate">{label}</span>
                <span className="text-xs text-subtle">{list.entries.length}</span>
              </Dropdown.Item>
            );
          })}
          <Dropdown.Separator className="my-1 h-px bg-border" />
          {creating ? (
            <div className="flex items-center gap-1 px-1 py-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.listNewPlaceholder}
                autoFocus
                className="h-8 min-w-0 flex-1 rounded-sm bg-raised px-2 text-xs text-fg outline-none placeholder:text-subtle"
                onKeyDown={(e) => {
                  if (e.key === "Enter") makeAndAdd();
                }}
              />
              <button type="button" onClick={makeAndAdd} className="h-8 rounded-sm px-2 text-xs text-accent hover:bg-raised">
                {t.listCreateAdd}
              </button>
            </div>
          ) : (
            <Dropdown.Item
              onSelect={(e) => {
                e.preventDefault();
                setCreating(true);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none hover:bg-raised"
            >
              <Plus className="size-3.5" />
              {t.listNew}
            </Dropdown.Item>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
