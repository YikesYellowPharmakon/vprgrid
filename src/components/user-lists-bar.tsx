import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { displayListName, SAVED_LIST_ID, type UserList } from "@/lib/catalog/lists";
import { useT } from "@/lib/i18n";
import { useGrain } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

export function UserListsBar({ lists, activeId }: { lists: UserList[]; activeId: string }) {
  const t = useT();
  const setActiveList = useGrain((s) => s.setActiveList);
  const createList = useGrain((s) => s.createList);
  const renameList = useGrain((s) => s.renameList);
  const removeList = useGrain((s) => s.removeList);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const active = lists.find((l) => l.id === activeId) ?? lists[0];

  function submitNew() {
    const id = createList(newName);
    if (id) {
      setActiveList(id);
      toast(t.toastListCreated(newName.trim()));
      setNewName("");
      setAdding(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {lists.map((list) => {
          const on = list.id === active?.id;
          return (
            <button
              key={list.id}
              type="button"
              onClick={() => setActiveList(list.id)}
              className={cn(
                "h-8 rounded-sm px-2.5 text-xs",
                on ? "bg-surface text-fg shadow-[var(--shadow-border)]" : "text-muted hover:bg-raised hover:text-fg",
              )}
            >
              {displayListName(list, t.listDefaultName)}
              <span className="ml-1.5 text-subtle">{list.entries.length}</span>
            </button>
          );
        })}
        {adding ? (
          <span className="flex items-center gap-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t.listNewPlaceholder}
              autoFocus
              className="h-8 w-36 rounded-sm bg-surface px-2 text-xs text-fg shadow-[var(--shadow-border)] outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNew();
                if (e.key === "Escape") setAdding(false);
              }}
            />
            <Button size="sm" variant="secondary" onClick={submitNew}>
              {t.listNew}
            </Button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs text-muted hover:bg-raised hover:text-fg"
          >
            <Plus className="size-3.5" />
            {t.listNew}
          </button>
        )}
      </div>
      {active ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {editing && active.id !== SAVED_LIST_ID ? (
            <>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
                className="h-8 rounded-sm bg-surface px-2 text-sm text-fg shadow-[var(--shadow-border)] outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    renameList(active.id, editName);
                    setEditing(false);
                  }
                  if (e.key === "Escape") setEditing(false);
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  renameList(active.id, editName);
                  setEditing(false);
                }}
              >
                {t.listRename}
              </Button>
            </>
          ) : (
            <p className="text-sm text-fg">
              {displayListName(active, t.listDefaultName)}
              <span className="ml-2 text-xs text-subtle">{t.listCount(active.entries.length)}</span>
            </p>
          )}
          {active.id !== SAVED_LIST_ID ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditName(displayListName(active, t.listDefaultName));
                  setEditing(true);
                }}
                className="inline-flex size-8 items-center justify-center rounded-sm text-muted hover:bg-raised hover:text-fg"
                aria-label={t.listRename}
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => removeList(active.id)}
                className="inline-flex size-8 items-center justify-center rounded-sm text-muted hover:bg-raised hover:text-danger"
                aria-label={t.listDelete}
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
