/* 首屏静态数字雨:在 boot.js 起来之前先铺满一屏字符,避免打开新标签页时黑一下。
   必须是外部脚本 —— MV3 的 CSP 不执行内联 <script>。 */
(function () {
  try {
    var t = document.documentElement.getAttribute("data-theme");
    if (t && t !== "matrix") return;
    var h = document.getElementById("bgfx");
    if (!h || h.querySelector(".prerain")) return;
    var d = document.createElement("div");
    d.className = "prerain";
    d.setAttribute("aria-hidden", "true");
    var g = "ﾅｱﾜｦﾊﾗﾝｼｿｷﾎｳﾔﾂﾈﾒｹﾙ0123456789=*+<>♪♫#";
    var n = g.length;
    var cols = Math.ceil((innerWidth || 800) / 16);
    var rows = Math.ceil((innerHeight || 600) / 15) + 3;
    var f = document.createDocumentFragment();
    for (var i = 0; i < cols * rows; i++) {
      var cell = document.createElement("span");
      cell.textContent = g[(Math.random() * n) | 0];
      f.appendChild(cell);
    }
    d.appendChild(f);
    h.insertBefore(d, h.firstChild);
  } catch (e) {}
})();
