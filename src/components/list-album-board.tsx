import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { ScoredAlbum } from "@/lib/catalog/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AddToListMenu } from "./add-to-list-menu";
import { Sleeve } from "./sleeve";
import { Button } from "./ui/button";

export type ListedAlbum = ScoredAlbum & { listKey: string };

function useListSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
}

function finishDrag(ev: DragEndEvent, onReorder: (fromKey: string, toKey: string) => void) {
  const from = String(ev.active.id);
  const to = ev.over ? String(ev.over.id) : "";
  if (!to || from === to) return;
  onReorder(from, to);
}

export function SortableAlbumList({
  albums,
  enabled,
  onReorder,
  renderRow,
}: {
  albums: ListedAlbum[];
  enabled: boolean;
  onReorder: (fromKey: string, toKey: string) => void;
  renderRow: (album: ListedAlbum, handle: ReactNode) => ReactNode;
}) {
  const sensors = useListSensors();
  if (!enabled) {
    return <ol className="mt-1 divide-y divide-border">{albums.map((album) => <li key={album.listKey}>{renderRow(album, null)}</li>)}</ol>;
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(ev) => finishDrag(ev, onReorder)}>
      <SortableContext items={albums.map((a) => a.listKey)} strategy={verticalListSortingStrategy}>
        <ol className="mt-1 divide-y divide-border">
          {albums.map((album) => (
            <SortableItem key={album.listKey} id={album.listKey}>
              {(handle) => renderRow(album, handle)}
            </SortableItem>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

export function SortableAlbumGrid({
  albums,
  enabled,
  onReorder,
  renderTile,
}: {
  albums: ListedAlbum[];
  enabled: boolean;
  onReorder: (fromKey: string, toKey: string) => void;
  renderTile: (album: ListedAlbum, handle: ReactNode) => ReactNode;
}) {
  const sensors = useListSensors();
  if (!enabled) {
    return (
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {albums.map((album) => (
          <div key={album.listKey}>{renderTile(album, null)}</div>
        ))}
      </div>
    );
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(ev) => finishDrag(ev, onReorder)}>
      <SortableContext items={albums.map((a) => a.listKey)} strategy={rectSortingStrategy}>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {albums.map((album) => (
            <SortableTile key={album.listKey} id={album.listKey}>
              {(handle) => renderTile(album, handle)}
            </SortableTile>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function DragHandle({ attributes, listeners }: { attributes: object; listeners: object | undefined }) {
  const t = useT();
  return (
    <button
      type="button"
      aria-label={t.listDrag}
      className="inline-flex size-9 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted hover:bg-raised hover:text-fg active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" />
    </button>
  );
}

function SortableItem({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("album-row", isDragging && "relative z-10 bg-surface")}
    >
      {children(<DragHandle attributes={attributes} listeners={listeners} />)}
    </li>
  );
}

function SortableTile({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "relative z-10 opacity-80")}
    >
      {children(<DragHandle attributes={attributes} listeners={listeners} />)}
    </div>
  );
}

export function SelectCheck({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: (shift: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(e.shiftKey);
      }}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-raised hover:text-fg",
        checked && "text-accent",
      )}
    >
      <span
        className={cn(
          "inline-flex size-4 items-center justify-center rounded-sm shadow-[var(--shadow-border)]",
          checked && "bg-accent text-accent-foreground",
        )}
      >
        {checked ? <Check className="size-3" /> : null}
      </span>
    </button>
  );
}

export function CoverHoverAdd({ album }: { album: ScoredAlbum }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="pointer-events-auto absolute right-2 bottom-2">
        <AddToListMenu
          album={album}
          hoverReveal
          triggerClassName="size-8 bg-bg/75 text-fg backdrop-blur-sm hover:bg-bg"
        />
      </div>
    </div>
  );
}

export function ListRemoveBtn({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <Button variant="ghost" size="icon-sm" aria-label={t.listDelete} className="text-subtle hover:text-fg" onClick={onClick}>
      <Trash2 className="size-4" />
    </Button>
  );
}

export function ListGridTile({
  album,
  rank,
  selected,
  dragHandle,
  onOpen,
  onRemove,
  onToggleSelect,
}: {
  album: ListedAlbum;
  rank: number;
  selected?: boolean;
  dragHandle?: ReactNode;
  onOpen: () => void;
  onRemove: () => void;
  onToggleSelect?: (shift: boolean) => void;
}) {
  const t = useT();
  return (
    <div className={cn("album-tile group relative text-left", selected && "rounded-lg bg-raised/70")}>
      <div className="relative">
        <button type="button" onClick={onOpen} className="block w-full text-left">
          <Sleeve album={album} size="hero" />
          <span className="font-display absolute top-2 left-2 rounded-sm bg-bg/75 px-1.5 text-xs italic tabular-nums backdrop-blur-sm">
            {rank}
          </span>
        </button>
        <CoverHoverAdd album={album} />
      </div>
      <div className="mt-2 flex items-start gap-1">
        {onToggleSelect ? (
          <SelectCheck checked={Boolean(selected)} label={t.ariaSelectAlbum(album.title)} onToggle={onToggleSelect} />
        ) : null}
        {dragHandle}
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-xs text-muted">{album.artist}</p>
          <p className="truncate text-sm transition-colors group-hover:text-fg">{album.title}</p>
        </button>
      </div>
      <button
        type="button"
        aria-label={t.listDelete}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-2 right-2 rounded-sm bg-bg/75 p-1.5 text-muted opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
