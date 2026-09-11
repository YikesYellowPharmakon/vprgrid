import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  isoFromRymDate,
  parseRymChartHtml,
  parseWikiAlbumList,
} from "../src/lib/catalog/parse-web-releases.mjs";

const RYM_FIXTURE = `
<div class="page_charts_section_charts_item_image_link" href="/release/album/boards-of-canada/inferno/">
  <img src="//e.snmc.io/i/300/s/501b2e1d6c4056cd01ea3e94c7f6d6e4/14532480/Boards%20of%20Canada%20-%20Inferno%2C%20Cover%20art.jpeg" />
  <div class="page_charts_section_charts_item_title">
    <a class="release" href="/release/album/boards-of-canada/inferno/">
      <span class="ui_name_locale_original">Inferno</span>
    </a>
    <div class="page_charts_section_charts_item_title_date_compact">
      <span>29 May 2026</span>
      <span class="page_charts_section_charts_item_release_type">Album</span>
    </div>
  </div>
  <a class="artist" href="/artist/boards-of-canada">
    <span class="ui_name_locale_original">Boards of Canada</span>
  </a>
  <a class="genre comma_separated first" href="/genre/downtempo/">Downtempo</a>
  <span class="page_charts_section_charts_item_details_average_num">3.88</span>
</div>
<div class="page_charts_section_charts_item_image_link" href="/release/album/warning/rituals-of-shame/">
  <img src="//e.snmc.io/i/300/s/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1/Warning%20-%20Rituals%20of%20Shame%2C%20Cover%20art.jpeg" />
  <div class="page_charts_section_charts_item_title">
    <a class="release" href="/release/album/warning/rituals-of-shame/">
      <span class="ui_name_locale_original">Rituals of Shame</span>
    </a>
    <span>19 Jun 2026</span>
    <span class="page_charts_section_charts_item_release_type">Album</span>
  </div>
  <a class="artist" href="/artist/warning"><span class="ui_name_locale_original">Warning</span></a>
  <a class="genre" href="/genre/doom-metal/">Doom Metal</a>
  <span class="page_charts_section_charts_item_details_average_num">3.90</span>
</div>
`;

const WIKI_FIXTURE = `
=== July ===
{| class="wikitable"
|-
! scope="col"| Release date
! scope="col"| Artist
! scope="col"| Album
|-
! scope="row" | July<br>3
| [[Deep Purple]]
| ''[[Splat!]]''
| Hard rock
|-
|}
=== August ===
{| class="wikitable"
|-
! scope="col"| Release date
! scope="col"| Artist
! scope="col"| Album
|-
! scope="row" | August<br>24
| [[NCT 127]]
| ''Blingy''
|
|-
! rowspan="2" | August<br>28
| [[Alabama Shakes]]
| ''I Must Be Dreaming''
|
|-
| [[Airbourne]]
| ''Airbourne''
|
|-
|}
`;

test("RYM 日期解析", () => {
  assert.equal(isoFromRymDate("29 May 2026"), "2026-05-29");
  assert.equal(isoFromRymDate("19 Jun 2026"), "2026-06-19");
});

test("RYM 图表块:艺人/标题/封面不串台,评分折成 0–100", () => {
  const items = parseRymChartHtml(RYM_FIXTURE);
  assert.equal(items.length, 2);
  assert.equal(items[0].artist, "Boards of Canada");
  assert.equal(items[0].title, "Inferno");
  assert.equal(items[0].date, "2026-05-29");
  assert.equal(items[0].userScore, 78);
  assert.match(items[0].cover ?? "", /Inferno/);
  assert.equal(items[1].artist, "Warning");
  assert.match(items[1].cover ?? "", /Rituals/);
});

test("维基月份表:日期 rowspan 继承到下一行", () => {
  const items = parseWikiAlbumList(WIKI_FIXTURE, "2026", ["July", "August"]);
  assert.equal(items.length, 4);
  const nct = items.find((x) => x.title === "Blingy");
  const shakes = items.find((x) => x.artist === "Alabama Shakes");
  const air = items.find((x) => x.artist === "Airbourne");
  assert.equal(nct?.date, "2026-08-24");
  assert.equal(shakes?.date, "2026-08-28");
  assert.equal(air?.date, "2026-08-28");
  assert.equal(nct?.source, "wiki");
});
