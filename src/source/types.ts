// Shapes mapped from Field Theory bookmarks.jsonl exports. Fields we do not use are tolerated via
// the index signature. reading.db never stores these; the corpus stays owned by Field Theory and is
// read fresh when building candidates.

export interface RawAuthor {
  id?: string;
  handle?: string;
  name?: string;
  bio?: string;
  followerCount?: number;
  followingCount?: number;
  isVerified?: boolean;
}

export interface RawEngagement {
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  quoteCount?: number;
  bookmarkCount?: number;
}

export interface RawMediaObject {
  type?: string;
  url?: string;
}

export interface RawBookmark {
  id: string;
  tweetId?: string;
  url: string;
  text?: string;
  authorHandle?: string;
  authorName?: string;
  author?: RawAuthor;
  postedAt?: string;
  bookmarkedAt?: string | null;
  syncedAt?: string;
  language?: string;
  engagement?: RawEngagement;
  media?: string[];
  mediaObjects?: RawMediaObject[];
  links?: string[];
  tags?: string[];
  sortIndex?: string;
  quotedStatusId?: string | null;
  quotedTweet?: unknown;
  [key: string]: unknown;
}

// Field Theory classification for one item, read via `ft list --json` and joined into a candidate by
// ft_id. Runtime-only; never persisted into reading.db. "unclassified" from ft becomes null here so
// the skill treats it as no signal.
export interface Classification {
  primaryCategory: string | null;
  categories: string[];
  primaryDomain: string | null;
  domains: string[];
}

export interface BookmarkFilter {
  // Reserved for later milestones (author, since, category). Unused in M2.
  authorHandle?: string;
}

export interface SyncOptions {
  pull?: boolean;
  gaps?: boolean;
  withMedia?: boolean;
}

export interface BookmarkSource {
  id: "field-theory" | "manual-export";
  // Refresh the corpus (may pull via ft) and return it.
  sync(opts?: SyncOptions): Promise<RawBookmark[]>;
  // Read the local corpus without any network call.
  list(filter?: BookmarkFilter): Promise<RawBookmark[]>;
}

export interface ParseResult {
  bookmarks: RawBookmark[];
  errors: number;
}

// Parses JSONL text (one bookmark object per line). Malformed lines are skipped and counted
// rather than throwing, so one bad line never loses the whole corpus.
export function parseBookmarksJsonl(text: string): ParseResult {
  const bookmarks: RawBookmark[] = [];
  let errors = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const obj = JSON.parse(trimmed) as RawBookmark;
      if (obj && typeof obj.id === "string" && typeof obj.url === "string") {
        bookmarks.push(obj);
      } else {
        errors++;
      }
    } catch {
      errors++;
    }
  }
  return { bookmarks, errors };
}
