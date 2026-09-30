const BOTS =
  /bot|crawl|spider|slurp|headless|python|curl|wget|node-?fetch|okhttp|facebookexternalhit|preview|lighthouse|monitoring|scrapy|java|go\/|pingdom|uptimerobot/i;

export function isBot(userAgent: string): boolean {
  if (!userAgent) return true;
  return BOTS.test(userAgent);
}

export function parseUserAgent(ua: string) {
  const s = ua || "";
  let browser = "Unknown";
  if (/edg\//i.test(s)) browser = "Edge";
  else if (/opr\/|opera/i.test(s)) browser = "Opera";
  else if (/firefox\//i.test(s)) browser = "Firefox";
  else if (/chrome\/|crios/i.test(s)) browser = "Chrome";
  else if (/safari\//i.test(s) && !/chrome/i.test(s)) browser = "Safari";
  else if (/samsungbrowser/i.test(s)) browser = "Samsung Internet";

  let os = "Unknown";
  if (/windows nt/i.test(s)) os = "Windows";
  else if (/android/i.test(s)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(s)) os = "iOS";
  else if (/mac os x/i.test(s)) os = "macOS";
  else if (/cros/i.test(s)) os = "ChromeOS";
  else if (/linux/i.test(s)) os = "Linux";

  let device: "Desktop" | "Mobile" | "Tablet" = "Desktop";
  if (/ipad|tablet|playbook|silk/i.test(s)) device = "Tablet";
  else if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(s))
    device = "Mobile";
  else if (/android/i.test(s)) device = "Tablet";

  return { browser, os, device };
}

const NICE_REFERRERS: Record<string, string> = {
  "google.com": "Google",
  "www.google.com": "Google",
  "google": "Google",
  "bing.com": "Bing",
  "duckduckgo.com": "DuckDuckGo",
  "yandex.ru": "Yandex",
  "baidu.com": "Baidu",
  "x.com": "X (Twitter)",
  "twitter.com": "X (Twitter)",
  "t.co": "X (Twitter)",
  "facebook.com": "Facebook",
  "m.facebook.com": "Facebook",
  "l.facebook.com": "Facebook",
  "instagram.com": "Instagram",
  "linkedin.com": "LinkedIn",
  "lnkd.in": "LinkedIn",
  "reddit.com": "Reddit",
  "t.reddit.com": "Reddit",
  "news.ycombinator.com": "Hacker News",
  "github.com": "GitHub",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "pinterest.com": "Pinterest",
  "tiktok.com": "TikTok",
  "producthunt.com": "Product Hunt",
  "discord.com": "Discord",
  "discord.gg": "Discord",
  "whatsapp.com": "WhatsApp",
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "claude.ai": "Claude",
  "perplexity.ai": "Perplexity",
  "medium.com": "Medium",
  "substack.com": "Substack",
  "quora.com": "Quora",
  "telegram.org": "Telegram",
};

export function hostnameOf(url: string): string {
  if (!url) return "";
  try {
    if (url.startsWith("/") || !url.includes("://")) return "";
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function referrerSource(referrer: string, selfHost: string): string {
  if (!referrer) return "";
  const host = hostnameOf(referrer);
  if (!host) return "";
  if (selfHost && (host === selfHost || host.endsWith("." + selfHost)))
    return "";
  const bare = host.replace(/^www\./, "");
  if (NICE_REFERRERS[bare]) return NICE_REFERRERS[bare];
  const first = bare.split(".")[0];
  const pretty =
    first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, " ");
  return pretty;
}

export function utmFromSearch(url: string): Record<string, string> {
  try {
    const u = new URL(url);
    const out: Record<string, string> = {};
    const source = u.searchParams.get("utm_source");
    const medium = u.searchParams.get("utm_medium");
    const campaign = u.searchParams.get("utm_campaign");
    const term = u.searchParams.get("utm_term");
    const content = u.searchParams.get("utm_content");
    if (source) out.utm_source = source;
    if (medium) out.utm_medium = medium;
    if (campaign) out.utm_campaign = campaign;
    if (term) out.utm_term = term;
    if (content) out.utm_content = content;
    return out;
  } catch {
    return {};
  }
}

export function geoFromHeaders(headers: Headers) {
  const country =
    headers.get("x-vercel-ip-country") ||
    headers.get("cf-ipcountry") ||
    headers.get("x-country-code") ||
    "";
  const city =
    headers.get("x-vercel-ip-city") ||
    headers.get("cf-ipcity") ||
    "";
  const region =
    headers.get("x-vercel-ip-country-region") ||
    headers.get("cf-region") ||
    "";
  return {
    country: decodeCity(country),
    region: decodeCity(region),
    city: decodeCity(city),
  };
}

function decodeCity(v: string): string {
  if (!v) return "";
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export function firstTouchLabel(
  utm_source: string,
  referrer_source: string,
  referrer: string,
): { source: string; referrer: string } {
  if (utm_source) return { source: utm_source, referrer: referrer_source };
  if (referrer_source) return { source: referrer_source, referrer: referrer_source };
  return { source: "Direct", referrer: "" };
}
