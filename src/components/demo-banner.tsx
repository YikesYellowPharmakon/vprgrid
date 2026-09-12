import { isPublicDemo } from "@/lib/demo";
import { useT } from "@/lib/i18n";

/** 公开演示站顶栏：说明这是空参考、数据只在访客浏览器里。本机开发不渲染。 */
export function DemoBanner() {
  const t = useT();
  if (!isPublicDemo) return null;
  return (
    <div className="border-b border-border bg-raised">
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 sm:px-6 lg:px-8">
        <span className="text-xs font-medium uppercase tracking-widest text-accent">{t.demoBadge}</span>
        <p className="text-xs leading-relaxed text-muted">{t.demoBlurb}</p>
      </div>
    </div>
  );
}
