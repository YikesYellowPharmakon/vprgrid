import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetContent({
  className,
  children,
  side: _side = "right",
  title,
  ...props
}: React.ComponentProps<typeof Dialog.Content> & {
  side?: "right" | "bottom";
  title?: string;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-bg/72" />
      <Dialog.Content
        aria-describedby={undefined}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex h-[min(88dvh,46rem)] w-[calc(100vw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-surface text-fg shadow-[var(--shadow-border)] outline-none",
          className,
        )}
        {...props}
      >
        <Dialog.Title className="sr-only">{title ?? "面板"}</Dialog.Title>
        <Dialog.Close className="absolute top-3 right-3 z-10 flex size-11 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-fg">
          <X className="size-4" />
          <span className="sr-only">关闭</span>
        </Dialog.Close>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
