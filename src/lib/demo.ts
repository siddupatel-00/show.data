import { bulk, run } from "./db";
import type { Website } from "./sites";

const SOURCES: [string, string, string, number][] = [
  ["Direct", "", "", 26],
  ["Google", "organic", "google", 20],
  ["X (Twitter)", "social", "twitter", 14],
  ["GitHub", "referral", "github", 8],
  ["Reddit", "social", "reddit", 6],
  ["Hacker News", "social", "news.ycombinator.com", 5],
  ["LinkedIn", "social", "linkedin", 4],
  ["YouTube", "social", "youtube", 4],
  ["Newsletter", "email", "newsletter", 6],
  ["Product Hunt", "referral", "producthunt.com", 4],
];

const CAMPAIGNS = ["launch", "indie-hackers", "summer-sale", "build-in-public", ""];

const COUNTRIES: [string, number][] = [
  ["US", 32],
  ["IN", 12],
  ["GB", 9],
  ["DE", 7],
  ["CA", 6],
  ["FR", 5],
  ["AU", 4],
  ["NL", 3],
  ["BR", 5],
  ["JP", 3],
  ["ES", 3],
  ["SE", 2],
  ["PL", 2],
  ["MX", 2],
  ["OTHER", 5],
];

const DEVICES: [string, number][] = [
  ["Desktop", 62],
  ["Mobile", 31],
  ["Tablet", 7],
];

const BROWSERS: [string, number][] = [
  ["Chrome", 54],
  ["Safari", 20],
  ["Firefox", 10],
  ["Edge", 9],
  ["Samsung Internet", 3],
  ["Opera", 2],
  ["Unknown", 2],
];

const OSES: [string, number][] = [
  ["Windows", 36],
  ["macOS", 21],
  ["iOS", 18],
  ["Android", 16],
  ["Linux", 5],
  ["ChromeOS", 3],
  ["Unknown", 1],
];

const PATHS: [string, number][] = [
  ["/", 30],
  ["/pricing", 13],
  ["/blog/how-i-grew-to-5k-mrr", 12],
  ["/blog/analytics-for-indie-hackers", 8],
  ["/docs/getting-started", 11],
  ["/docs/revenue-attribution", 7],
  ["/features", 8],
  ["/demo", 5],
  ["/changelog", 3],
  ["/blog/twitter-attribution", 3],
];

const TITLES: Record<string, string> = {
  "/": "SidFast — revenue-first analytics",
  "/pricing": "Pricing — SidFast",
  "/features": "Features — SidFast",
  "/demo": "Live demo — SidFast",
  "/changelog": "Changelog — SidFast",
};

function pick<T>(items: [T, number][]): T {
  const total = items.reduce((a, b) => a + b[1], 0);
  let r = Math.random() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[0][0];
}

function pickSource() {
  const total = SOURCES.reduce((a, s) => a + s[3], 0);
  let r = Math.random() * total;
  for (const s of SOURCES) {
    r -= s[3];
    if (r <= 0) return s;
  }
  return SOURCES[0];
}

function randId(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++)
    s += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)];
  return s;
}

const COLS = [
  "website_id", "visitor_id", "session_id", "type", "path", "title",
  "referrer", "referrer_source", "utm_source", "utm_medium", "utm_campaign",
  "utm_term", "utm_content", "goal_name", "country", "region", "city",
  "browser", "os", "device", "screen", "amount", "currency", "customer_email",
  "first_source", "first_referrer", "first_campaign", "last_source",
  "last_referrer", "metadata", "is_bot", "created_at",
];

function lit(v: unknown): string {
  if (v === undefined || v === null) return "0";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "0";
  if (typeof v === "boolean") return v ? "1" : "0";
  const str = String(v).replace(/\0/g, "").replace(/'/g, "''");
  return `'${str}'`;
}

function insertSql(rows: Record<string, unknown>[]): string {
  const tuples = rows
    .map((r) => "(" + COLS.map((c) => lit(c === "is_bot" ? (r[c] ?? 0) : r[c])).join(",") + ")")
    .join(",");
  return `INSERT INTO events (${COLS.join(",")}) VALUES ${tuples}`;
}

export async function seedDemo(site: Website, days = 60) {
  const now = Date.now();
  const rows: Record<string, unknown>[] = [];

  const blank = {
    website_id: site.id,
    type: "pageview",
    title: "",
    referrer: "",
    referrer_source: "",
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    utm_term: "",
    utm_content: "",
    goal_name: "",
    region: "",
    city: "",
    screen: "",
    amount: 0,
    currency: "USD",
    customer_email: "",
    first_source: "",
    first_referrer: "",
    first_campaign: "",
    last_source: "",
    last_referrer: "",
    metadata: "",
  };

  for (let d = days; d >= 0; d--) {
    const dayDate = new Date(now - d * 86400_000);
    dayDate.setUTCHours(0, 0, 0, 0);
    const dayStart = dayDate.getTime();
    const span = d === 0 ? Math.max(1, now - dayStart) : 86_400_000;
    const growth = 1 + ((days - d) / days) * 1.6;
    const weekday = dayDate.getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 0.72 : 1;
    const visitors = Math.max(
      8,
      Math.round((28 + Math.random() * 26) * growth * weekend),
    );

    for (let v = 0; v < visitors; v++) {
      const [srcName, medium, srcRef] = pickSource();
      const campaign =
        medium && Math.random() < 0.45
          ? CAMPAIGNS[Math.floor(Math.random() * (CAMPAIGNS.length - 1))]
          : "";
      const visitorId = `demo_${randId(16)}`;
      const sessionId = randId(12);
      const country = pick(COUNTRIES);
      const device = pick(DEVICES);
      const browser = pick(BROWSERS);
      const os = pick(OSES);
      const screen =
        device === "Mobile"
          ? ["390x844", "360x800", "412x915"][Math.floor(Math.random() * 3)]
          : device === "Tablet"
            ? "820x1180"
            : ["1920x1080", "1512x982", "2560x1440", "1366x768"][
                Math.floor(Math.random() * 4)
              ];
      const createdAt = dayStart + Math.floor(Math.random() * span);
      const firstSource = srcName;
      const firstReferrer =
        srcRef && srcName !== "Direct" ? srcRef : "";

      const pathCount =
        Math.random() < 0.42 ? 1 : 2 + Math.floor(Math.random() * 5);
      const paths: string[] = [];
      for (let p = 0; p < pathCount; p++) {
        paths.push(p === 0 && Math.random() < 0.62 ? "/" : pick(PATHS));
      }

      let lastTouch = "";
      paths.forEach((path, i) => {
        const t = createdAt + i * (12_000 + Math.random() * 90_000);
        const isEntry = i === 0;
        const referrerSource =
          isEntry && srcName !== "Direct" ? srcRef || srcName : "";
        lastTouch = referrerSource;
        rows.push({
          ...blank,
          visitor_id: visitorId,
          session_id: sessionId,
          path,
          title: TITLES[path] || path,
          referrer:
            isEntry && srcRef && medium !== "email"
              ? `https://${srcRef}/`
              : "",
          referrer_source: referrerSource,
          utm_source: isEntry && srcName !== "Direct" ? srcName : "",
          utm_medium: isEntry ? medium : "",
          utm_campaign: isEntry ? campaign : "",
          country,
          browser,
          os,
          device,
          screen,
          first_source: firstSource,
          first_referrer: firstReferrer,
          first_campaign: campaign,
          last_source: firstSource,
          last_referrer: referrerSource,
          created_at: Math.round(t),
        });
      });

      const lastT = createdAt + (paths.length - 1) * 60_000;
      const didSignup = Math.random() < 0.14;
      if (didSignup) {
        rows.push({
          ...blank,
          visitor_id: visitorId,
          session_id: sessionId,
          type: "goal",
          path: "/signup",
          goal_name: "signup",
          country,
          browser,
          os,
          device,
          screen,
          first_source: firstSource,
          first_referrer: firstReferrer,
          first_campaign: campaign,
          last_source: firstSource,
          last_referrer: lastTouch,
          created_at: Math.round(lastT),
        });
        if (Math.random() < 0.28) {
          const amount = [19, 19, 19, 49, 49, 99, 290][
            Math.floor(Math.random() * 7)
          ];
          rows.push({
            ...blank,
            visitor_id: visitorId,
            session_id: sessionId,
            type: "payment",
            path: "/pricing",
            goal_name: "purchase",
            country,
            browser,
            os,
            device,
            screen,
            amount,
            currency: "USD",
            customer_email: `user${randId(5)}@example.com`,
            utm_source: firstSource,
            referrer_source: lastTouch,
            first_source: firstSource,
            first_referrer: firstReferrer,
            first_campaign: campaign,
            last_source: firstSource,
            last_referrer: lastTouch,
            created_at: Math.round(lastT + 40_000),
          });
        }
      }
    }
  }

  rows.sort((a, b) => (a.created_at as number) - (b.created_at as number));

  const statements: string[] = [];
  for (let i = 0; i < rows.length; i += 150)
    statements.push(insertSql(rows.slice(i, i + 150)));
  statements.push(
    `INSERT OR IGNORE INTO goals (id, website_id, name, created_at) VALUES ('g_${site.id}_signup', '${site.id}', 'signup', ${now})`,
    `INSERT OR IGNORE INTO goals (id, website_id, name, created_at) VALUES ('g_${site.id}_newsletter', '${site.id}', 'newsletter', ${now})`,
  );
  await bulk(statements);
  return { events: rows.length, days };
}

/**
 * Removes seeded demo traffic only. Real pageviews and the site's configured
 * goals are left alone — "clear demo data" must never destroy live tracking.
 */
export async function clearDemo(siteId: string) {
  await run("DELETE FROM events WHERE website_id = ? AND visitor_id GLOB 'demo_*'", [
    siteId,
  ]);
}
