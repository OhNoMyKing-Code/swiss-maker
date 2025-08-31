import fetch from "node-fetch";
import { URLSearchParams } from "url";

export const config = {
  server: "https://lichess.org",
  team: "AggressiveBot",               // Team ID chính xác từ URL Lichess
  oauthToken: process.env.OAUTH_TOKEN!, // Token trong GitHub Secrets
  daysInAdvance: 1,                     // tạo bao nhiêu ngày trước
  dryRun: false,                        // true = chỉ debug, false = tạo thật
  arena: {
    name: () => "Hourly Ultrabullet",
    description: (nextLink?: string) => `Next: ${nextLink ?? "coming soon"}`,
    clockTime: 0.25,       // phút / người (0.25 = 15s)
    clockIncrement: 0,
    minutes: 60,           // duration 60 phút
    rated: true,
    variant: "standard",
    intervalHours: 1,      // cứ 1h tạo 1 giải
  },
};

function assertEnv() {
  console.log("Debug: OAUTH_TOKEN is set:", !!process.env.OAUTH_TOKEN);
  if (!config.oauthToken) throw new Error("OAUTH_TOKEN fehlt. Setze die Umgebungsvariable OAUTH_TOKEN.");
}

/** Next even UTC hour */
function nextEvenUtcHour(from: Date): Date {
  const d = new Date(from);
  const h = d.getUTCHours();
  const nextEven = Math.floor(h / 2) * 2 + 2;
  d.setUTCHours(nextEven, 0, 0, 0);
  return d;
}

async function createArena(startDate: Date, nextLink: string) {
  const dateISO = startDate.toISOString();

  const body = new URLSearchParams({
    name: config.arena.name(),
    description: config.arena.description(nextLink),
    clockTime: String(config.arena.clockTime),
    clockIncrement: String(config.arena.clockIncrement),
    minutes: String(config.arena.minutes),
    rated: config.arena.rated ? "true" : "false",
    variant: config.arena.variant,
    startDate: dateISO,
  });

  console.log(`Creating team arena on ${dateISO} UTC`);

  if (config.dryRun) {
    console.log("DRY RUN Arena:", Object.fromEntries(body));
    return "dry-run";
  }

  const res = await fetch(
    `${config.server}/api/team/${config.team}/tournament`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.oauthToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    }
  );

  console.log("Response status:", res.status);
  if (!res.ok) {
    const errText = await res.text();
    console.error("Arena creation failed:", res.status, errText);
    return null;
  }

  const data = await res.json();
  const url = data.id ? `${config.server}/tournament/${data.id}` : null;
  console.log("Arena created:", url);
  return url;
}

async function main() {
  assertEnv();

  const now = new Date();
  const firstStart = nextEvenUtcHour(now);

  const arenasPerDay = Math.floor(24 / config.arena.intervalHours);
  const totalArenas = arenasPerDay * config.daysInAdvance;

  console.log(`Creating ${totalArenas} arenas for team ${config.team}`);

  let prevUrl: string | null = null;

  for (let i = 0; i < totalArenas; i++) {
    if (i > 0) await new Promise(resolve => setTimeout(resolve, 60000)); // tránh rate limit

    const startDate = new Date(firstStart.getTime() + i * config.arena.intervalHours * 60 * 60 * 1000);

    const arenaUrl = await createArena(startDate, prevUrl ?? "tba");
    if (arenaUrl) prevUrl = arenaUrl;
  }
}

main().catch(err => console.error(err));
