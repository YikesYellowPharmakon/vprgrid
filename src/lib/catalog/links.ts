export function searchLinks(artist: string, title: string) {
  const q = encodeURIComponent(`${artist} ${title}`.trim());
  return {
    musicbrainz: `https://musicbrainz.org/search?query=${q}&type=release_group&method=indexed`,
    discogs: `https://www.discogs.com/search/?q=${q}&type=release`,
    bandcamp: `https://bandcamp.com/search?q=${q}`,
    aoty: `https://www.albumoftheyear.org/search/?q=${q}`,
    rym: `https://rateyourmusic.com/search?searchterm=${q}&searchtype=l`,
  };
}

export function coverUrls(releaseMbid: string | null, groupMbid: string): {
  sm: string | null;
  lg: string | null;
} {
  if (releaseMbid) {
    return {
      sm: `https://coverartarchive.org/release/${releaseMbid}/front-250`,
      lg: `https://coverartarchive.org/release/${releaseMbid}/front-500`,
    };
  }
  if (groupMbid) {
    return {
      sm: `https://coverartarchive.org/release-group/${groupMbid}/front-250`,
      lg: `https://coverartarchive.org/release-group/${groupMbid}/front-500`,
    };
  }
  return { sm: null, lg: null };
}
