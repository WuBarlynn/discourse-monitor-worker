import type { Env } from "./types";

export interface Forum {
  id: number;
  name: string;
  url: string;
  last_topic_id: number;
  last_check_at: number | null;
  last_check_time: string | null;
  error_log: string;
}

export interface BarkClient {
  id: number;
  name: string;
  client_key: string;
}

export async function getSettings(env: Env): Promise<Record<string, string>> {
  const result = await env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  return Object.fromEntries(result.results.map(({ key, value }) => [key, value]));
}

export async function updateSettings(env: Env, settings: Record<string, string>): Promise<void> {
  const statements = Object.entries(settings).map(([key, value]) =>
    env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value),
  );
  await env.DB.batch(statements);
}

export function shanghaiTime(): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function currentShanghaiClock(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

export function isPushTime(start: string, end: string): boolean {
  if (!start || !end) return true;
  const now = currentShanghaiClock();
  return start <= end ? now >= start && now <= end : now >= start || now <= end;
}

async function setStat(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare("INSERT INTO stats (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value).run();
}

async function incrementNotificationStats(env: Env, title: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("UPDATE stats SET value = CAST(value AS INTEGER) + 1 WHERE key = 'total_notified'"),
    env.DB.prepare("INSERT INTO stats (key, value) VALUES ('last_notified_title', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(title),
  ]);
}

async function sendNotifications(env: Env, title: string, content: string, url: string, forumName: string, settings: Record<string, string>): Promise<void> {
  const clients = (await env.DB.prepare("SELECT id, name, client_key FROM bark_clients").all<BarkClient>()).results;
  const gotifyServer = settings.gotify_server?.trim();
  const gotifyToken = settings.gotify_token?.trim();
  if (!clients.length && !(gotifyServer && gotifyToken)) return;

  const fullTitle = `[${forumName}] ${title}`;
  const barkServer = (settings.bark_server || "https://api.day.app").replace(/\/$/, "");
  const barkIcon = settings.bark_icon?.trim() || "https://upload.wikimedia.org/wikipedia/commons/1/14/Discourse_logo.png";
  const requests: Promise<Response>[] = clients.map(({ client_key }) =>
    fetch(`${barkServer}/${encodeURIComponent(client_key)}/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: fullTitle, body: content, url, group: forumName, icon: barkIcon }),
    }),
  );

  if (gotifyServer && gotifyToken) {
    requests.push(fetch(`${gotifyServer.replace(/\/$/, "")}/message?token=${encodeURIComponent(gotifyToken)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: fullTitle,
        message: `${content}\n\n[点击查看原帖](${url})`,
        priority: 5,
        extras: {
          "client::display": { contentType: "text/markdown" },
          "client::notification": { click: { url } },
        },
      }),
    }));
  }

  const results = await Promise.allSettled(requests);
  if (results.some((result) => result.status === "fulfilled" && result.value.ok)) {
    await incrementNotificationStats(env, fullTitle);
  }
}

export async function checkAllForums(env: Env, force = false): Promise<void> {
  const settings = await getSettings(env);
  if (!force && !isPushTime(settings.push_time_start, settings.push_time_end)) {
    await setStat(env, "global_last_check", `${shanghaiTime()} (处于免打扰时段，已暂停)`);
    return;
  }

  const forums = (await env.DB.prepare("SELECT * FROM forums ORDER BY id").all<Forum>()).results;
  if (!forums.length) {
    await setStat(env, "global_last_check", `${shanghaiTime()} (未配置任何论坛)`);
    return;
  }

  const interval = Math.max(Number(settings.check_interval || 300), 60) * 1000;
  await Promise.all(forums.map((forum) => checkForum(env, forum, settings, interval, force)));
  await setStat(env, "global_last_check", shanghaiTime());
}

async function checkForum(env: Env, forum: Forum, settings: Record<string, string>, interval: number, force: boolean): Promise<void> {
  if (!force && forum.last_check_at && Date.now() - forum.last_check_at < interval) return;

  const checkedAt = Date.now();
  const checkedTime = shanghaiTime();
  try {
    const response = await fetch(forum.url, { headers: { "user-agent": "Discourse Monitor Worker" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json<{ topic_list?: { topics?: Array<{ id: number; title: string; slug: string; last_poster_username?: string; category_id?: number }> } }>();
    const topics = data.topic_list?.topics ?? [];
    let maxId = forum.last_topic_id;

    for (const topic of [...topics].reverse()) {
      if (topic.id <= forum.last_topic_id) continue;
      const forumBase = forum.url.replace(/\/latest\.json(?:\?.*)?$/, "");
      const topicUrl = `${forumBase}/t/${topic.slug}/${topic.id}`;
      if (forum.last_topic_id !== 0) {
        await sendNotifications(env, `新帖: ${topic.title}`, `来自论坛: ${forum.name}\n作者: **${topic.last_poster_username || "未知"}**\n分类ID: ${topic.category_id ?? "未知"}`, topicUrl, forum.name, settings);
      }
      maxId = Math.max(maxId, topic.id);
    }

    await env.DB.prepare("UPDATE forums SET last_topic_id = ?, last_check_at = ?, last_check_time = ?, error_log = '无' WHERE id = ?")
      .bind(maxId, checkedAt, checkedTime, forum.id).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare("UPDATE forums SET last_check_at = ?, last_check_time = ?, error_log = ? WHERE id = ?")
      .bind(checkedAt, checkedTime, `请求失败: ${message}`, forum.id).run();
  }
}

export async function syncForumIds(env: Env): Promise<void> {
  const forums = (await env.DB.prepare("SELECT * FROM forums ORDER BY id").all<Forum>()).results;
  await Promise.all(forums.map(async (forum) => {
    try {
      const response = await fetch(forum.url, { headers: { "user-agent": "Discourse Monitor Worker" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json<{ topic_list?: { topics?: Array<{ id: number }> } }>();
      const topics = data.topic_list?.topics ?? [];
      const maxId = topics.reduce((max, topic) => Math.max(max, topic.id), forum.last_topic_id);
      await env.DB.prepare("UPDATE forums SET last_topic_id = ?, last_check_at = ?, last_check_time = ?, error_log = '同步ID成功' WHERE id = ?")
        .bind(maxId, Date.now(), shanghaiTime(), forum.id).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await env.DB.prepare("UPDATE forums SET error_log = ? WHERE id = ?").bind(`同步ID失败: ${message}`, forum.id).run();
    }
  }));
}
