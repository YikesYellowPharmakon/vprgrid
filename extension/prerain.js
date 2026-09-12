/* 首屏静态雨底:只画一帧 canvas,不挂 CSS 动画,也不铺几千个 DOM 节点。
   动态雨起来后会被 radar.js 卸掉,避免和新标签页抢合成。 */
(function () {
  try {
    var t = document.documentElement.getAttribute("data-theme");
    if (t && t !== "matrix") return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var h = document.getElementById("bgfx");
    if (!h || h.querySelector(".prerain")) return;
    var w = innerWidth || 800;
    var ht = innerHeight || 600;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    var c = document.createElement("canvas");
    c.className = "prerain";
    c.setAttribute("aria-hidden", "true");
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(ht * dpr));
    c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:0.45";
    var ctx = c.getContext("2d", { alpha: true });
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = "15px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var g = "ﾅｱﾜｦﾊﾗﾝｼｿｷﾎｳﾔﾂﾈﾒｹﾙ0123456789=*+<>♪♫#";
    var n = g.length;
    var COL = 16;
    var ROW = 13;
    var cols = Math.ceil(w / COL);
    var rows = Math.ceil(ht / ROW) + 2;
    for (var col = 0; col < cols; col++) {
      var head = Math.random() * rows;
      var len = 16 + ((Math.random() * 20) | 0);
      for (var i = 0; i < len; i++) {
        var row = (head - i) | 0;
        if (row < 0 || row >= rows) continue;
        var persist = Math.pow(1 - i / len, 0.48);
        ctx.globalAlpha = i === 0 ? 0.7 : persist * 0.45;
        ctx.fillStyle = i === 0 ? "#e8fff0" : "#00ff66";
        ctx.fillText(g[(Math.random() * n) | 0], col * COL + COL / 2, row * ROW + ROW / 2);
      }
    }
    h.insertBefore(c, h.firstChild);
  } catch (e) {}
})();
