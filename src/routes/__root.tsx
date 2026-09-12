import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth/provider";
import { syncMatrixRain } from "@/lib/matrix-rain";
import appCss from "../styles.css?url";

const APP_NAME = "VprGrid.SYS";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "这周有什么值得听的实验 / 小众新专辑？VprGrid 按口味从公开目录过筛。不用注册，数据只留在你的浏览器。",
      },
      { name: "theme-color", content: "#020703" },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/icon-16.png" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/icon-32.png" },
      { rel: "icon", type: "image/png", sizes: "48x48", href: "/icon-48.png" },
      { rel: "icon", type: "image/png", sizes: "128x128", href: "/icon-128.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&family=Montserrat:wght@600;700&family=Noto+Sans+SC:wght@400;500;600&family=Roboto:wght@300;400;500&family=Space+Grotesk:wght@400;500;600&family=DotGothic16&display=swap",
      },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  useEffect(() => {
    syncMatrixRain(document.documentElement.getAttribute("data-theme") || "matrix");
  }, []);
  return (
    <html lang="zh-CN" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var s=JSON.parse(localStorage.getItem("grain-friday-v4"));var st=s&&s.state;var t=st&&st.theme;var el=document.documentElement;if(t==="cybercore")t="red-alert";var ok={matrix:1,"cyber-neon":1,"grainy-blur":1,"red-alert":1,custom:1};if(t&&!ok[t])t="matrix";if(t)el.setAttribute("data-theme",t);if(t==="custom"&&st.customTheme){var c=st.customTheme;var m=function(a,p,b){return"color-mix(in srgb, "+a+" "+p+"%, "+b+")"};var v=el.style;v.setProperty("--color-bg",c.bg);v.setProperty("--color-fg",c.fg);v.setProperty("--color-surface",m(c.fg,6,c.bg));v.setProperty("--color-raised",m(c.fg,11,c.bg));v.setProperty("--color-muted",m(c.fg,64,c.bg));v.setProperty("--color-subtle",m(c.fg,44,c.bg));v.setProperty("--color-accent",c.accent);v.setProperty("--color-accent-foreground",m(c.bg,90,c.fg));v.setProperty("--color-border",m(c.fg,14,"transparent"));v.setProperty("--color-ring",c.accent);if(c.image)v.setProperty("--custom-bg-image","url(\\""+c.image.replace(/["\\\\]/g,"")+"\\")");el.setAttribute("data-custom-texture",c.texture||"grain")}}catch(e){}',
          }}
        />
        <PreviewHostBridge />
        {/* 主题动态背景层:两个伪元素承载各主题的漂移/扫光动画,垫在内容之下 */}
        <div id="bgfx" aria-hidden="true">
          <div className="bgfx-ra ra-allied" />
          <div className="bgfx-ra ra-soviet" />
          <div className="bgfx-ra ra-scout" />
        </div>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider delayDuration={280}>
              <Outlet />
              <Toaster
                position="bottom-center"
                toastOptions={{
                  style: {
                    background: "var(--color-raised)",
                    color: "var(--color-fg)",
                    border: "1px solid var(--color-border)",
                  },
                }}
              />
            </TooltipProvider>
          </QueryClientProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
