/**
 * 公开演示站开关。只在构建时带上 VITE_VPRGRID_DEMO=1 才为真。
 * 本机 `npm run dev` 不设这个变量，仍是你自己的完整应用（亲选参考、本机档案）。
 */
export const isPublicDemo =
  import.meta.env.VITE_VPRGRID_DEMO === "1" || import.meta.env.VITE_VPRGRID_DEMO === "true";
