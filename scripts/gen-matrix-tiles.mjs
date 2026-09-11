/* 生成 Matrix 数字雨的三层 SVG 瓦片(宽瓦片 + 不规则列位 + 逐字随机),
   输出可直接粘进 CSS 的 url() 字符串。确定性伪随机,便于复现。 */

let seed = 20260826;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const GLYPHS = [
  "ﾅ", "ｱ", "ﾜ", "ｦ", "ﾊ", "ﾗ", "ﾝ", "ｼ", "ｿ", "ｷ", "ﾎ", "ｳ", "ﾔ", "ﾂ", "ﾈ", "ﾒ", "ｹ", "ﾙ",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "=", "+", "*", "#", "%", "<", ">", "?", ":", ";",
];

function tile({ w, h, fill, cols, glyphMin, glyphMax, opMin, opMax, szMin, szMax }) {
  // 列的 x 坐标:不等距(基准格 + 抖动),避免复读感
  const xs = [];
  const step = w / cols;
  for (let i = 0; i < cols; i++) {
    xs.push(Math.round(i * step + 4 + rnd() * (step - 18)));
  }
  let body = "";
  for (const x of xs) {
    const n = glyphMin + Math.floor(rnd() * (glyphMax - glyphMin + 1));
    // 每列自己的起点与松紧
    let y = 14 + rnd() * (h / n);
    for (let k = 0; k < n && y < h - 6; k++) {
      const size = (szMin + rnd() * (szMax - szMin)).toFixed(0);
      const op = (opMin + rnd() * (opMax - opMin)).toFixed(2);
      body += `<text x='${x}' y='${Math.round(y)}' font-size='${size}' opacity='${op}'>${pick(GLYPHS)}</text>`;
      y += h / n * (0.6 + rnd() * 0.8);
    }
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' font-family='monospace' fill='${fill}'>${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}")`;
}

const layers = [
  // 近层:亮、密、字大
  { w: 240, h: 420, fill: "#00ff66", cols: 7, glyphMin: 4, glyphMax: 6, opMin: 0.1, opMax: 0.34, szMin: 11, szMax: 15 },
  // 中层:中亮中密
  { w: 320, h: 560, fill: "#58c273", cols: 7, glyphMin: 3, glyphMax: 5, opMin: 0.06, opMax: 0.18, szMin: 10, szMax: 13 },
  // 远层:暗、疏、字小
  { w: 400, h: 700, fill: "#33804a", cols: 6, glyphMin: 2, glyphMax: 4, opMin: 0.05, opMax: 0.12, szMin: 9, szMax: 12 },
];

const urls = layers.map((l) => tile(l));
console.log("/* background-image */");
console.log(urls.map((u) => `    ${u}`).join(",\n") + ";");
console.log(`/* background-size: ${layers.map((l) => `${l.w}px ${l.h}px`).join(", ")} */`);
