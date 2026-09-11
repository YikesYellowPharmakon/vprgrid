import { createFileRoute } from "@tanstack/react-router";
import { GrainApp } from "@/components/grain-app";
import { parseAppSearch } from "@/lib/album-link";
import { getWeekCatalog } from "@/lib/catalog/api";
import { toIso } from "@/lib/catalog/week";
import { fridayOfWeek, mondayOf, monthEnd, monthStart, sundayOf } from "@/lib/catalog/weeks";

export const Route = createFileRoute("/")({
  validateSearch: parseAppSearch,
  loaderDeps: ({ search }) => ({ week: search.week, month: search.month }),
  loader: ({ deps }) => {
    let start: string;
    let end: string;
    if (deps.month) {
      start = monthStart(deps.month);
      end = monthEnd(deps.month);
    } else if (deps.week) {
      start = mondayOf(deps.week);
      end = sundayOf(start);
    } else {
      start = mondayOf(toIso(new Date()));
      end = sundayOf(start);
    }
    // fast:缓存命中直接带全量数据首屏;冷启动立即交白卷让页面先渲染,
    // 客户端看到 partial 标记后马上重新请求(此时后台构建已在跑)
    return getWeekCatalog({
      data: { friday: fridayOfWeek(mondayOf(start)), weekStart: start, weekEnd: end, fast: true },
    });
  },
  component: Home,
});

function Home() {
  const initial = Route.useLoaderData();
  const openLink = Route.useSearch();
  return <GrainApp initial={initial} openLink={openLink} />;
}
