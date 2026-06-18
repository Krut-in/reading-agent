// Canonical-URL normalization. Two keys for two jobs:
//
// 1. canonicalUrl(raw): the dedupe key for X tweet permalinks (used by ingest). It lowercases the
//    host, folds the X/Twitter host family to x.com, strips the query and fragment, drops a trailing
//    slash, and truncates X status sub-paths (/photo, /video, /analytics, engagement tabs) back to
//    /<user>/status/<id>. It keeps the username case, which is what guarantees every existing clean
//    permalink canonicalizes to itself, so no reading.db backfill is needed.
//
// 2. canonicalResourceUrl(raw): the cluster key for outbound resources (used by the same-resource
//    signal). It lowercases the host, strips the fragment, drops a trailing slash, and PRESERVES the
//    path and the query, because an outbound resource can carry a meaningful query (a YouTube ?v= id
//    or a ?t= timestamp). Tracking-param stripping is deferred until the data shows a query-variant
//    duplicate; none exists today.

// The X/Twitter host family. Any of these folds to x.com for the permalink dedupe key.
const X_HOST_FAMILY = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "m.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "m.twitter.com",
]);

// The leading /<user>/status/<id> portion of an X status path. Anything after it (/photo/N, /video/N,
// /analytics, /likes, /reposts, /quotes, /history, and any future tab) points at the same tweet and
// is dropped by truncating to this match.
const X_STATUS_PREFIX = /^\/[^/]+\/status\/\d+/;

export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.search = "";
    u.hostname = u.hostname.toLowerCase();
    if (X_HOST_FAMILY.has(u.hostname)) {
      u.hostname = "x.com";
      const match = u.pathname.match(X_STATUS_PREFIX);
      if (match) {
        u.pathname = match[0];
      }
    }
    let s = u.toString();
    if (s.endsWith("/")) {
      s = s.slice(0, -1);
    }
    return s;
  } catch {
    return raw.trim();
  }
}

export function canonicalResourceUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    if (s.endsWith("/")) {
      s = s.slice(0, -1);
    }
    return s;
  } catch {
    return raw.trim();
  }
}
