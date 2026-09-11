/**
 * Music-Map (music-map.com / Gnod) 艺人相近图。
 * 读公开页上的艺人节点 + Aid 相近矩阵,自己画图,不嵌他们的页面。
 */
import { createServerFn } from "@tanstack/react-start";

const UA = "VprGrid.SYS/1.0 (album radar; contact: none)";
const MAX_NODES = 21;
const BASE = "https://www.music-map.com";

export type MusicMapNode = {
  name: string;
  slug: string;
  /** 与中心艺人的相近度 0–1,中心为 1。 */
  sim: number;
};

export type MusicMapEdge = { a: number; b: number; w: number };

export type MusicMapGraph = {
  artist: string;
  url: string;
  nodes: MusicMapNode[];
  edges: MusicMapEdge[];
};

function primaryArtist(raw: string): string {
  return raw.split(/\s*(?:\/|&|,|feat\.?|ft\.?)\s*/i)[0]?.trim() || raw.trim();
}

/** 合辑署名:Various Artists / V.A. / オムニバス 等,没有可画的单个艺人。 */
const VA_CREDIT =
  /^(?:various(?:\s+artists?)?|v\.?\s*a\.?|v\s*\/\s*a|オムニバス|ヴァリアス(?:[・\s]*アーティスト)?|合[輯辑])\.?$/i;

export function isVariousArtistCredit(name: string): boolean {
  const n = name
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/\s+/g, " ");
  return n.length > 0 && VA_CREDIT.test(n);
}

function foldArtist(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, "");
}

/** 查到的中心艺人必须就是这张专辑的艺人,搜到别人一律当没有。 */
function sameArtist(query: string, found: string): boolean {
  const a = foldArtist(query);
  const b = foldArtist(found);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

function graphMatchesArtist(graph: MusicMapGraph, artist: string): boolean {
  return sameArtist(artist, graph.artist) || sameArtist(artist, graph.nodes[0]?.name ?? "");
}

function slugOf(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "+")
    .replace(/&/g, "%26");
}

async function getHtml(url: string): Promise<{ status: number; html: string; finalUrl: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(6000),
    redirect: "follow",
  });
  const html = await res.text();
  return { status: res.status, html, finalUrl: res.url || url };
}

function parseGraph(html: string, fallbackName: string, pageUrl: string): MusicMapGraph | null {
  if (/Aaaargh woah 404/i.test(html)) return null;
  const block = html.match(/<div id=gnodMap>([\s\S]*?)<\/div>/i);
  if (!block) return null;
  const found: Array<{ name: string; slug: string }> = [];
  const re = /<a href="([^"]+)" class=S id=s\d+>([^<]*)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block[1]))) {
    const href = m[1];
    const name = m[2].replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
    if (!name) continue;
    const slug = href.includes("gnoosic.com") ? slugOf(name) : href.replace(/^\//, "");
    found.push({ name, slug });
  }
  if (found.length < 2) return null;

  const aid0 = html.match(/Aid\[0\]=new Array\(([^)]*)\)/);
  const raw = aid0
    ? aid0[1].split(",").map((s) => Number(s.trim()))
    : [];
  const peak = Math.max(0.001, ...raw.filter((n) => Number.isFinite(n) && n > 0));

  const nodes: MusicMapNode[] = found.slice(0, MAX_NODES).map((n, i) => {
    if (i === 0) return { ...n, sim: 1 };
    const w = Number.isFinite(raw[i]) && raw[i] > 0 ? raw[i] / peak : Math.max(0.12, 1 - i / MAX_NODES);
    return { ...n, sim: Math.min(1, w) };
  });

  const edges: MusicMapEdge[] = [];
  for (let i = 1; i < nodes.length; i++) {
    edges.push({ a: 0, b: i, w: nodes[i].sim });
  }
  const peerRe = /Aid\[(\d+)\]=new Array\(([^)]*)\)/g;
  const peers: Array<{ i: number; j: number; w: number }> = [];
  let row: RegExpExecArray | null;
  while ((row = peerRe.exec(html))) {
    const i = Number(row[1]);
    if (i === 0 || i >= nodes.length) continue;
    const vals = row[2].split(",").map((s) => Number(s.trim()));
    for (let j = i + 1; j < nodes.length && j < vals.length; j++) {
      const w = vals[j];
      if (Number.isFinite(w) && w > peak * 0.55) peers.push({ i, j, w: w / peak });
    }
  }
  peers.sort((a, b) => b.w - a.w);
  for (const e of peers.slice(0, 14)) edges.push({ a: e.i, b: e.j, w: e.w * 0.55 });

  const title = html.match(/id=the_title[^>]*>([^<]+)/i)?.[1]?.trim();
  return {
    artist: title || found[0]?.name || fallbackName,
    url: pageUrl.startsWith("http") ? pageUrl : `${BASE}/${nodes[0].slug}`,
    nodes,
    edges,
  };
}

export const fetchMusicMap = createServerFn({ method: "POST" })
  .validator((d: { artist: string }) => d)
  .handler(async ({ data }): Promise<{ ok: true; graph: MusicMapGraph } | { ok: false; error: string }> => {
    const artist = primaryArtist(data.artist);
    if (artist.length < 1) return { ok: false, error: "no-artist" };
    if (isVariousArtistCredit(artist)) return { ok: false, error: "not-found" };
    try {
      const direct = await getHtml(`${BASE}/${slugOf(artist)}`);
      let graph = parseGraph(direct.html, artist, direct.finalUrl);
      if (graph && !graphMatchesArtist(graph, artist)) graph = null;
      if (!graph) {
        const searched = await getHtml(`${BASE}/map-search.php?f=${encodeURIComponent(artist)}`);
        graph = parseGraph(searched.html, artist, searched.finalUrl);
        if (graph && !graphMatchesArtist(graph, artist)) graph = null;
      }
      if (!graph) return { ok: false, error: "not-found" };
      return { ok: true, graph };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "fail" };
    }
  });
