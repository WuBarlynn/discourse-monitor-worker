import { clearSessionCookie, createSessionCookie, isAuthenticated, passwordsMatch } from "./auth";
import { checkAllForums, getSettings, syncForumIds, updateSettings } from "./monitor";
import type { BarkClient, Forum } from "./monitor";
import type { Env } from "./types";
import { dashboardPage, loginPage } from "./views";

const html = (body: string, status = 200, headers: HeadersInit = {}) => new Response(body, { status, headers: { "content-type": "text/html; charset=UTF-8", ...headers } });
const redirect = (location: string, headers: HeadersInit = {}) => new Response(null, { status: 303, headers: { location, ...headers } });

async function requireAuth(request: Request, env: Env): Promise<Response | null> {
  return await isAuthenticated(request, env) ? null : redirect("/login");
}

async function dashboard(env: Env): Promise<Response> {
  const [forums, clients, stats, settings] = await Promise.all([
    env.DB.prepare("SELECT * FROM forums ORDER BY id").all<Forum>(),
    env.DB.prepare("SELECT id, name, client_key FROM bark_clients ORDER BY id").all<BarkClient>(),
    env.DB.prepare("SELECT key, value FROM stats").all<{ key: string; value: string }>(),
    getSettings(env),
  ]);
  return html(dashboardPage({ forums: forums.results, clients: clients.results, stats: Object.fromEntries(stats.results.map(({ key, value }) => [key, value])), settings }));
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname === "/login" && request.method === "GET") return html(loginPage());
  if (pathname === "/login" && request.method === "POST") {
    const form = await request.formData();
    const username = String(form.get("username") || "");
    const password = String(form.get("password") || "");
    if (username !== env.ADMIN_USERNAME || !passwordsMatch(password, env.ADMIN_PASSWORD)) return html(loginPage("用户名或密码错误"), 401);
    return redirect("/", { "set-cookie": await createSessionCookie(env) });
  }
  if (pathname === "/logout") return redirect("/login", { "set-cookie": clearSessionCookie() });

  const forbidden = await requireAuth(request, env);
  if (forbidden) return forbidden;
  if (pathname === "/" && request.method === "GET") return dashboard(env);

  if (pathname === "/forums" && request.method === "POST") {
    const form = await request.formData();
    const name = String(form.get("name") || "").trim();
    const forumUrl = String(form.get("url") || "").trim();
    try {
      const parsed = new URL(forumUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
      if (name && forumUrl) await env.DB.prepare("INSERT OR IGNORE INTO forums (name, url) VALUES (?, ?)").bind(name, forumUrl).run();
    } catch { /* 忽略无效 URL 并返回控制台。 */ }
    return redirect("/");
  }

  const forumDelete = pathname.match(/^\/forums\/(\d+)\/delete$/);
  if (forumDelete && request.method === "POST") {
    await env.DB.prepare("DELETE FROM forums WHERE id = ?").bind(Number(forumDelete[1])).run();
    return redirect("/");
  }

  if (pathname === "/clients" && request.method === "POST") {
    const form = await request.formData();
    const name = String(form.get("name") || "").trim();
    const key = String(form.get("key") || "").trim();
    if (name && key) await env.DB.prepare("INSERT OR IGNORE INTO bark_clients (name, client_key) VALUES (?, ?)").bind(name, key).run();
    return redirect("/");
  }

  const clientDelete = pathname.match(/^\/clients\/(\d+)\/delete$/);
  if (clientDelete && request.method === "POST") {
    await env.DB.prepare("DELETE FROM bark_clients WHERE id = ?").bind(Number(clientDelete[1])).run();
    return redirect("/");
  }

  if (pathname === "/settings" && request.method === "POST") {
    const form = await request.formData();
    const interval = Math.max(60, Number(form.get("check_interval") || 300));
    await updateSettings(env, {
      check_interval: String(Number.isFinite(interval) ? interval : 300),
      bark_server: String(form.get("bark_server") || "").trim(),
      bark_icon: String(form.get("bark_icon") || "").trim(),
      gotify_server: String(form.get("gotify_server") || "").trim(),
      gotify_token: String(form.get("gotify_token") || "").trim(),
      push_time_start: String(form.get("push_time_start") || "00:00"),
      push_time_end: String(form.get("push_time_end") || "23:59"),
    });
    return redirect("/");
  }

  if (pathname === "/force-check" && request.method === "POST") {
    await checkAllForums(env, true);
    return redirect("/");
  }
  if (pathname === "/sync-ids" && request.method === "POST") {
    await syncForumIds(env);
    return redirect("/");
  }
  return new Response("Not Found", { status: 404 });
}

export default {
  fetch: handleRequest,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(checkAllForums(env));
  },
} satisfies ExportedHandler<Env>;
