import Firecrawl from "@mendable/firecrawl-js";

export type ScrapeFailure = {
  ok: false;
  reason: "LOGIN_WALL" | "NOT_FOUND" | "BLOCKED" | "EMPTY" | "TIMEOUT" | "ERROR" | "CREDITS" | "RATE_LIMIT";
  message: string;
};

export type ScrapeSuccess = {
  ok: true;
  sourceUrl: string;
  title?: string;
  markdown: string;
  screenshotUrl?: string;
};

export type ScrapeResult = ScrapeSuccess | ScrapeFailure;

const LOGIN_PATTERNS = [
  /sign\s*in/i,
  /log\s*in/i,
  /join\s*now/i,
  /join\s*linkedin/i,
  /create\s*account/i,
  /authwall/i,
  /please\s*log\s*in/i,
  /you\s*must\s*be\s*logged\s*in/i,
  /to\s*continue,?\s*sign\s*in/i,
];

const NOT_FOUND_PATTERNS = [
  /page\s*not\s*found/i,
  /this\s*page\s*doesn'?t\s*exist/i,
  /404\b/,
  /profile\s*not\s*found/i,
  /user\s*not\s*found/i,
];

type FirecrawlDoc = {
  markdown?: string;
  screenshot?: string;
  metadata?: {
    title?: string;
    statusCode?: number;
    sourceURL?: string;
    url?: string;
  };
  data?: FirecrawlDoc;
};

function pickField<T>(doc: FirecrawlDoc, key: "markdown" | "screenshot" | "metadata"): T | undefined {
  return (doc[key] ?? doc.data?.[key]) as T | undefined;
}

export async function scrapeProfile(url: string): Promise<ScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "ERROR", message: "FIRECRAWL_API_KEY not configured" };
  }

  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { ok: false, reason: "ERROR", message: "Invalid URL" };
  }

  const firecrawl = new Firecrawl({ apiKey });

  let raw: FirecrawlDoc;
  try {
    raw = (await firecrawl.scrape(url, {
      formats: ["markdown", "screenshot"],
      onlyMainContent: true,
      waitFor: 1500,
      timeout: 25000,
    })) as FirecrawlDoc;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/402|payment|credits/i.test(message)) {
      return { ok: false, reason: "CREDITS", message };
    }
    if (/429|rate/i.test(message)) {
      return { ok: false, reason: "RATE_LIMIT", message };
    }
    if (/timeout|timed?\s*out/i.test(message)) {
      return { ok: false, reason: "TIMEOUT", message };
    }
    if (/404/.test(message)) {
      return { ok: false, reason: "NOT_FOUND", message };
    }
    if (/403|401|forbidden|unauthor/i.test(message)) {
      return { ok: false, reason: "BLOCKED", message };
    }
    return { ok: false, reason: "ERROR", message };
  }

  const markdown = (pickField<string>(raw, "markdown") ?? "").trim();
  const screenshot = pickField<string>(raw, "screenshot");
  const metadata = pickField<{ title?: string; statusCode?: number; sourceURL?: string; url?: string }>(
    raw,
    "metadata",
  );
  const status = metadata?.statusCode ?? 0;

  if (status === 404 || NOT_FOUND_PATTERNS.some((re) => re.test(markdown))) {
    return { ok: false, reason: "NOT_FOUND", message: "Page not found (404)" };
  }
  if (status === 401 || status === 403) {
    return { ok: false, reason: "BLOCKED", message: `Blocked by site (HTTP ${status})` };
  }

  const head = markdown.slice(0, 1200);
  const looksLikeLoginWall = LOGIN_PATTERNS.filter((re) => re.test(head)).length >= 2;

  // Site-specific guards: these platforms almost never expose meaningful public HTML to scrapers.
  if (host.includes("linkedin.com")) {
    if (markdown.length < 600 || looksLikeLoginWall || /authwall|/i.test(head)) {
      return {
        ok: false,
        reason: "LOGIN_WALL",
        message: "LinkedIn requires login to view this profile. Public scraping returned a sign-in wall.",
      };
    }
  }
  if (host.includes("tinder.com") || host.includes("hinge.co") || host.includes("bumble.com")) {
    if (markdown.length < 400 || looksLikeLoginWall) {
      return {
        ok: false,
        reason: "LOGIN_WALL",
        message: "This dating app does not expose profiles to the public web. Upload screenshots instead.",
      };
    }
  }
  if (host.includes("soulapp") || host.includes("soul.com")) {
    return {
      ok: false,
      reason: "LOGIN_WALL",
      message: "Soul profiles are not publicly viewable. Upload screenshots instead.",
    };
  }

  if (markdown.length < 200) {
    return { ok: false, reason: "EMPTY", message: "Page returned almost no readable content." };
  }

  return {
    ok: true,
    sourceUrl: metadata?.sourceURL ?? metadata?.url ?? url,
    title: metadata?.title,
    markdown,
    screenshotUrl: screenshot,
  };
}
