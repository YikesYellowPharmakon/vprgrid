import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { EARLIER_KEY, formatMonth, formatWeek } from "@/lib/catalog/weeks";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

export type Grain = "week" | "month" | "custom";
export type CustomKind = "weeks" | "months";

const selectClass =
  "h-9 max-w-full rounded-md bg-raised px-2 text-xs text-muted shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Seg({
  on,
  children,
  onClick,
}: {
  on: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 rounded-sm px-2.5 text-xs",
        on ? "bg-surface text-fg shadow-[var(--shadow-border)]" : "text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

export function PeriodBar({
  grain,
  onGrain,
  customKind,
  onCustomKind,
  label,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  weekKey,
  weeks,
  onWeekKey,
  monthKey,
  months,
  onMonthKey,
  weekFrom,
  weekTo,
  onWeekFrom,
  onWeekTo,
  monthFrom,
  monthTo,
  onMonthFrom,
  onMonthTo,
  lang,
  showReset,
  onReset,
}: {
  grain: Grain;
  onGrain: (g: Grain) => void;
  customKind: CustomKind;
  onCustomKind: (k: CustomKind) => void;
  label: { title: string; range: string };
  onPrev: () => void;
  onNext: () => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
  weekKey: string;
  weeks: string[];
  onWeekKey: (k: string) => void;
  monthKey: string;
  months: string[];
  onMonthKey: (k: string) => void;
  weekFrom: string;
  weekTo: string;
  onWeekFrom: (k: string) => void;
  onWeekTo: (k: string) => void;
  monthFrom: string;
  monthTo: string;
  onMonthFrom: (k: string) => void;
  onMonthTo: (k: string) => void;
  lang: "zh" | "en";
  showReset: boolean;
  onReset: () => void;
}) {
  const t = useT();
  return (
    <>
      <div className="flex items-center gap-0.5 rounded-md bg-raised p-0.5 shadow-[var(--shadow-border)]">
        <Seg on={grain === "week"} onClick={() => onGrain("week")}>
          {t.periodWeek}
        </Seg>
        <Seg on={grain === "month"} onClick={() => onGrain("month")}>
          {t.periodMonth}
        </Seg>
        <Seg on={grain === "custom"} onClick={() => onGrain("custom")}>
          {t.periodCustom}
        </Seg>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t.ariaPrevPeriod}
          disabled={prevDisabled}
          onClick={onPrev}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="min-w-[9.5rem] text-center">
          <div className="font-display text-base">{label.title}</div>
          <div className="text-[11px] text-subtle">{label.range}</div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t.ariaNextPeriod}
          disabled={nextDisabled}
          onClick={onNext}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {grain === "week" ? (
        <select
          value={weekKey}
          suppressHydrationWarning
          onChange={(e) => onWeekKey(e.target.value)}
          aria-label={t.ariaSelectPeriod}
          className={selectClass}
        >
          {weeks.map((k) => {
            const l = formatWeek(k, lang);
            return (
              <option key={k} value={k}>
                {l.title} · {l.range}
              </option>
            );
          })}
        </select>
      ) : null}

      {grain === "month" ? (
        <select
          value={monthKey}
          suppressHydrationWarning
          onChange={(e) => onMonthKey(e.target.value)}
          aria-label={t.ariaSelectPeriod}
          className={selectClass}
        >
          {months.map((k) => {
            const l = formatMonth(k, lang);
            return (
              <option key={k} value={k}>
                {l.title} · {l.range}
              </option>
            );
          })}
        </select>
      ) : null}

      {grain === "custom" ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md bg-raised p-0.5 shadow-[var(--shadow-border)]">
            <Seg on={customKind === "weeks"} onClick={() => onCustomKind("weeks")}>
              {t.periodSpanWeeks}
            </Seg>
            <Seg on={customKind === "months"} onClick={() => onCustomKind("months")}>
              {t.periodSpanMonths}
            </Seg>
          </div>
          <span className="text-xs text-subtle">{t.periodFrom}</span>
          {customKind === "weeks" ? (
            <>
              <select value={weekFrom} onChange={(e) => onWeekFrom(e.target.value)} className={selectClass}>
                {weeks
                  .filter((k) => k !== EARLIER_KEY)
                  .map((k) => {
                    const l = formatWeek(k, lang);
                    return (
                      <option key={k} value={k}>
                        {l.title}
                      </option>
                    );
                  })}
              </select>
              <span className="text-xs text-subtle">{t.periodTo}</span>
              <select value={weekTo} onChange={(e) => onWeekTo(e.target.value)} className={selectClass}>
                {weeks
                  .filter((k) => k !== EARLIER_KEY)
                  .map((k) => {
                    const l = formatWeek(k, lang);
                    return (
                      <option key={k} value={k}>
                        {l.title}
                      </option>
                    );
                  })}
              </select>
            </>
          ) : (
            <>
              <select value={monthFrom} onChange={(e) => onMonthFrom(e.target.value)} className={selectClass}>
                {months.map((k) => {
                  const l = formatMonth(k, lang);
                  return (
                    <option key={k} value={k}>
                      {l.title}
                    </option>
                  );
                })}
              </select>
              <span className="text-xs text-subtle">{t.periodTo}</span>
              <select value={monthTo} onChange={(e) => onMonthTo(e.target.value)} className={selectClass}>
                {months.map((k) => {
                  const l = formatMonth(k, lang);
                  return (
                    <option key={k} value={k}>
                      {l.title}
                    </option>
                  );
                })}
              </select>
            </>
          )}
        </div>
      ) : null}

      {showReset ? (
        <Button variant="ghost" size="sm" onClick={onReset}>
          {t.backToPeriod}
        </Button>
      ) : null}
    </>
  );
}
