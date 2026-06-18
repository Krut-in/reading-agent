// Deterministic slug for a topic name. Lowercase, fold accents to ASCII, turn any run of
// non-alphanumeric characters into a single hyphen, and trim hyphens from the ends. Returns "" when
// the input has no alphanumerics (the caller rejects an empty slug). Two display names that fold to
// the same slug share one topic by design; the `--slug` override disambiguates when that is not
// wanted.
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
