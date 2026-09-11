import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "muted",
  ...props
}: React.ComponentProps<"span"> & { tone?: "muted" | "accent" | "solid" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium tracking-wide",
        tone === "muted" && "bg-raised text-muted",
        tone === "accent" && "bg-accent/12 text-fg",
        tone === "solid" && "bg-accent text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}
