import Firecrawl from "@mendable/firecrawl-js";

export type ScrapeFailure = {
  ok: false;
  reason:
    | "LOGIN_WALL"
    | "NOT_FOUND"
    | "BLOCKED"
    | "EMPTY"
    | "TIMEOUT"
    | "ERROR"
    | "CREDITS"
    | "RATE_LIMIT";
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
  /login/i,
  /join\s*now/i,
  /join\s*linkedin/i,
  /create\s*account/i,
  /authwall/i,
  /please\s*log\s*in/i,
  /you\s*must\s*be\s*logged\s*in/i,
  /to\s*continue,?\s*sign\s*in/i,
  /登录/,
  /登入/,
  /注册/,
  /验证码/,
  /手机号登录/,
  /手机号码/,
  /扫码登录/,
  /微信登录/,
  /继续访问/,
  /打开.*app/i,
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

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const XHS_MODAL_STATE_PATTERN =
  /DMATCH_XHS_LOGIN_MODAL_(DETECTED_AND_CLOSED|DETECTED_AND_REMOVED|DETECTED_BUT_STILL_BLOCKED|NEVER_DETECTED)/;
const XHS_CLOSED_MODAL_STATES = new Set([
  "DMATCH_XHS_LOGIN_MODAL_DETECTED_AND_CLOSED",
  "DMATCH_XHS_LOGIN_MODAL_DETECTED_AND_REMOVED",
]);

const XHS_LOGIN_WALL_PATTERNS = [
  /手机号登录/,
  /手机号码/,
  /验证码/,
  /扫码登录/,
  /微信登录/,
  /新用户可直接登录/,
  /安全验证/,
  /security verification/i,
  /verify you are human/i,
  /captcha/i,
  /登录后查看/,
  /打开小红书.*查看/,
];

const XHS_CLOSE_LOGIN_MODAL_SCRIPT = String.raw`
(async () => {
  const textMatches = (node, patterns) => {
    const text = (node.innerText || node.textContent || node.getAttribute?.("aria-label") || "").trim();
    return patterns.some((pattern) => pattern.test(text));
  };

  const clickFirstVisible = (selectors) => {
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        if (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        ) {
          node.click();
          return true;
        }
      }
    }
    return false;
  };

  const isVisible = (node) => {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      style.opacity !== "0"
    );
  };

  const isLoginContainerVisible = () =>
    Array.from(
      document.querySelectorAll(
        ".login-container, [class*='login-container'], [class*='login'][class*='modal'], [class*='login'][class*='container']",
      ),
    ).some((node) => {
      const text = (node.innerText || node.textContent || "").slice(0, 800);
      return isVisible(node) && /登录|注册|手机号|验证码|微信登录|扫码登录|打开.*app/i.test(text);
    });

  const writeState = (state) => {
    const markerId = "dmatch-xhs-scrape-state";
    const marker = document.getElementById(markerId) || document.createElement("div");
    marker.id = markerId;
    marker.textContent = state;
    marker.setAttribute("data-dmatch-xhs-state", state);
    marker.style.cssText =
      "position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;z-index:2147483647;color:#000;background:#000;font-size:1px;line-height:1px;";
    document.body.appendChild(marker);
    document.documentElement.setAttribute("data-dmatch-xhs-state", state);
  };

  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  const waitFor = async (predicate, timeoutMs, intervalMs = 250) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await sleep(intervalMs);
    }
    return predicate();
  };

  const clickXhsCloseIcon = () => {
    const nodes = [
      ...document.querySelectorAll(".login-container > .icon-btn-wrapper.close-button"),
      ...document.querySelectorAll(".login-container .icon-btn-wrapper.close-button"),
      ...document.querySelectorAll(".icon-btn-wrapper.close-button"),
      ...Array.from(document.querySelectorAll("use[href='#close'], use[xlink\\:href='#close']")).map(
        (node) => node.closest(".icon-btn-wrapper, .close-button, button, div") || node.parentElement,
      ),
    ].filter(Boolean);

    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      ) {
        node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        return true;
      }
    }

    return false;
  };

  const detectedLoginWall = await waitFor(isLoginContainerVisible, 6000);
  if (!detectedLoginWall) {
    writeState("DMATCH_XHS_LOGIN_MODAL_NEVER_DETECTED");
    return;
  }

  let clicked = clickXhsCloseIcon();

  clicked =
    clickFirstVisible([
    ".login-container > .icon-btn-wrapper.close-button",
    ".login-container .icon-btn-wrapper.close-button",
    ".icon-btn-wrapper.close-button",
    ".icon-btn-wrapper.close-button svg",
    "button.close",
    ".close-button",
    ".close-btn",
    ".close-icon",
    ".login-modal-close",
    ".modal-close",
    ".login-container .close",
    ".login-modal .close",
    ".reds-login-modal .close",
    ".red-login-modal .close",
    ".mask .close",
    ".modal .close",
    ".login-container [class*='close']",
    ".login-modal [class*='close']",
    "[class*='login'] [class*='close']",
    "[aria-label='Close']",
    "[aria-label='close']",
    "[aria-label='关闭']",
    "[title='关闭']",
    "[title='Close']",
    "button[class*='close']",
    "div[class*='close']",
    "span[class*='close']",
    "svg[class*='close']",
    ]) || clicked;

  const closeTextPatterns = [/^×$/, /^x$/i, /^close$/i, /^关闭$/, /^稍后再说$/, /^暂不登录$/];
  for (const node of document.querySelectorAll("button, div, span, svg")) {
    const rect = node.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top >= 0 &&
      rect.top < window.innerHeight &&
      rect.left >= 0 &&
      rect.left < window.innerWidth &&
      textMatches(node, closeTextPatterns)
    ) {
      node.click();
      clicked = true;
      break;
    }
  }

  document.body.style.overflow = "auto";
  document.documentElement.style.overflow = "auto";

  let removedBlockingLogin = false;
  for (const node of document.querySelectorAll("body > div, body > section, body > aside")) {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    const zIndex = Number.parseInt(style.zIndex || "0", 10);
    const text = (node.innerText || node.textContent || "").slice(0, 500);
    const looksLikeBlockingLogin =
      rect.width >= window.innerWidth * 0.45 &&
      rect.height >= window.innerHeight * 0.25 &&
      style.position === "fixed" &&
      zIndex >= 100 &&
      /登录|注册|手机号|验证码|微信登录|扫码登录|打开.*app/i.test(text);

    if (looksLikeBlockingLogin) {
      node.remove();
      removedBlockingLogin = true;
    }
  }

  const closedAfterClick = await waitFor(() => !isLoginContainerVisible(), 4000);
  const stillBlocked = !closedAfterClick && isLoginContainerVisible();
  writeState(
    stillBlocked
      ? "DMATCH_XHS_LOGIN_MODAL_DETECTED_BUT_STILL_BLOCKED"
      : clicked
        ? "DMATCH_XHS_LOGIN_MODAL_DETECTED_AND_CLOSED"
        : removedBlockingLogin
          ? "DMATCH_XHS_LOGIN_MODAL_DETECTED_AND_REMOVED"
          : "DMATCH_XHS_LOGIN_MODAL_DETECTED_AND_CLOSED",
  );
})();
`;

type RedirectInspection =
  | { kind: "none"; status: number }
  | { kind: "redirect"; status: number; location: string }
  | { kind: "error"; message: string };

function pickField<T>(
  doc: FirecrawlDoc,
  key: "markdown" | "screenshot" | "metadata",
): T | undefined {
  return (doc[key] ?? doc.data?.[key]) as T | undefined;
}

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timeout),
  };
}

async function requestWithoutRedirect(url: string, method: "HEAD" | "GET"): Promise<Response> {
  const { signal, cancel } = withTimeout(8000);
  try {
    return await fetch(url, {
      method,
      redirect: "manual",
      signal,
      headers:
        method === "GET"
          ? {
              Range: "bytes=0-0",
            }
          : undefined,
    });
  } finally {
    cancel();
  }
}

async function inspectFirstRedirect(url: string): Promise<RedirectInspection> {
  try {
    let response = await requestWithoutRedirect(url, "HEAD");

    // Some apps/CDNs do not implement HEAD correctly. Fall back to a tiny GET,
    // still with redirects disabled, so we can inspect Location without loading the target page.
    if (response.status === 405 || response.status === 403) {
      response = await requestWithoutRedirect(url, "GET");
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const rawLocation = response.headers.get("location");
      if (!rawLocation) {
        return {
          kind: "error",
          message: `URL returned HTTP ${response.status} redirect without a Location header.`,
        };
      }

      return {
        kind: "redirect",
        status: response.status,
        location: new URL(rawLocation, url).toString(),
      };
    }

    return { kind: "none", status: response.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "error", message };
  }
}

function isXhsHost(host: string): boolean {
  return (
    host.includes("xiaohongshu.com") ||
    host.includes("xhslink.com") ||
    host.includes("xhs.cn") ||
    host.includes("rednote.com")
  );
}

function shouldBlockRedirect(host: string): boolean {
  // Keep the previous anti-redirect policy for dating-app short links, but allow
  // Xiaohongshu/Rednote links to reach the real profile page so Firecrawl can
  // close the login modal after the SPA loads.
  return !isXhsHost(host);
}

function getXhsModalState(markdown: string): string | undefined {
  return markdown.match(XHS_MODAL_STATE_PATTERN)?.[0];
}

function stripXhsModalState(markdown: string): string {
  return markdown
    .split("\n")
    .filter((line) => !XHS_MODAL_STATE_PATTERN.test(line))
    .join("\n");
}

function hasXhsLoginWallContent(markdown: string): boolean {
  const head = markdown.slice(0, 3000);
  return XHS_LOGIN_WALL_PATTERNS.filter((re) => re.test(head)).length >= 1;
}

function getScrapeOptions(host: string) {
  const baseOptions = {
    formats: ["markdown", "screenshot"],
    onlyMainContent: true,
    waitFor: 1500,
    timeout: 25000,
  };

  if (!isXhsHost(host)) return baseOptions;

  return {
    ...baseOptions,
    onlyMainContent: false,
    waitFor: 5000,
    timeout: 45000,
    mobile: true,
    location: {
      country: "CN",
      languages: ["zh-CN", "zh"],
    },
    actions: [
      { type: "wait", milliseconds: 5000 },
      { type: "executeJavascript", script: XHS_CLOSE_LOGIN_MODAL_SCRIPT },
      { type: "wait", milliseconds: 1000 },
      { type: "scroll", direction: "down" },
      { type: "wait", milliseconds: 500 },
      { type: "scrape" },
    ],
  };
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

  const redirect = await inspectFirstRedirect(url);
  if (redirect.kind === "error") {
    return {
      ok: false,
      reason: "ERROR",
      message: `Could not safely inspect redirects before scraping: ${redirect.message}`,
    };
  }
  if (redirect.kind === "redirect" && shouldBlockRedirect(host)) {
    return {
      ok: true,
      sourceUrl: url,
      title: "Redirect-only profile URL",
      markdown: [
        "REDIRECT INSPECTION ONLY",
        `Submitted URL: ${url}`,
        `First response: HTTP ${redirect.status}`,
        `First-hop Location: ${redirect.location}`,
        "Policy: DMatch does not follow pasted URL redirects. The destination page was not fetched or opened.",
        "Evidence available: redirect metadata only. Treat profile authenticity confidence as low unless user notes or screenshots are also supplied.",
      ].join("\n"),
    };
  }

  const firecrawl = new Firecrawl({ apiKey });

  let raw: FirecrawlDoc;
  try {
    raw = (await firecrawl.scrape(url, getScrapeOptions(host))) as FirecrawlDoc;
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

  const scrapedMarkdown = (pickField<string>(raw, "markdown") ?? "").trim();
  const xhsModalState = isXhsHost(host) ? getXhsModalState(scrapedMarkdown) : undefined;
  const markdown = stripXhsModalState(scrapedMarkdown).trim();
  const screenshot = pickField<string>(raw, "screenshot");
  const metadata = pickField<{
    title?: string;
    statusCode?: number;
    sourceURL?: string;
    url?: string;
  }>(raw, "metadata");
  const status = metadata?.statusCode ?? 0;

  if (status === 404 || NOT_FOUND_PATTERNS.some((re) => re.test(markdown))) {
    return { ok: false, reason: "NOT_FOUND", message: "Page not found (404)" };
  }
  if (status === 401 || status === 403) {
    return { ok: false, reason: "BLOCKED", message: `Blocked by site (HTTP ${status})` };
  }
  if (isXhsHost(host)) {
    console.info("DMatch XHS modal state:", xhsModalState ?? "UNKNOWN");
  }
  if (xhsModalState === "DMATCH_XHS_LOGIN_MODAL_DETECTED_BUT_STILL_BLOCKED") {
    return {
      ok: false,
      reason: "LOGIN_WALL",
      message:
        "Xiaohongshu login modal was detected after the close attempt. Upload screenshots or paste profile text in Notes.",
    };
  }

  const head = markdown.slice(0, 1200);
  const loginPatternHits = LOGIN_PATTERNS.filter((re) => re.test(head)).length;
  const looksLikeLoginWall = loginPatternHits >= 2;

  // Site-specific guards: these platforms almost never expose meaningful public HTML to scrapers.
  if (host.includes("linkedin.com")) {
    if (markdown.length < 600 || looksLikeLoginWall || /authwall|/i.test(head)) {
      return {
        ok: false,
        reason: "LOGIN_WALL",
        message:
          "LinkedIn requires login to view this profile. Public scraping returned a sign-in wall.",
      };
    }
  }
  if (host.includes("tinder.com") || host.includes("hinge.co") || host.includes("bumble.com")) {
    if (markdown.length < 400 || looksLikeLoginWall) {
      return {
        ok: false,
        reason: "LOGIN_WALL",
        message:
          "This dating app does not expose profiles to the public web. Upload screenshots instead.",
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
  if (isXhsHost(host)) {
    const xhsProfileSignals = [
      /小红书号/,
      /获赞与收藏/,
      /关注/,
      /粉丝/,
      /笔记/,
      /IP属地/,
      /rednote/i,
      /xiaohongshu/i,
    ].filter((re) => re.test(markdown)).length;
    const hasLoginWallContent = hasXhsLoginWallContent(markdown);
    const confirmedClosed =
      xhsModalState !== undefined && XHS_CLOSED_MODAL_STATES.has(xhsModalState);

    if (
      (hasLoginWallContent && !confirmedClosed) ||
      (hasLoginWallContent && xhsProfileSignals < 2) ||
      (markdown.length < 500 && loginPatternHits >= 1) ||
      (looksLikeLoginWall && xhsProfileSignals < 2)
    ) {
      return {
        ok: false,
        reason: "LOGIN_WALL",
        message:
          "Xiaohongshu showed a login/app modal instead of enough public profile content. Upload screenshots or paste profile text in Notes.",
      };
    }
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
