export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Content-Type": "application/json; charset=utf-8",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const auth = request.headers.get("Authorization") || "";
    if (auth !== `Bearer ${env.SYNC_TOKEN}`) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: cors,
      });
    }

    if (request.method === "GET") {
      const value = await env.BILI_HISTORY_SYNC.get("history.json");
      return new Response(value || JSON.stringify({ empty: true }), { headers: cors });
    }

    if (request.method === "PUT") {
      const body = await request.text();
      await env.BILI_HISTORY_SYNC.put("history.json", body);
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    if (request.method === "DELETE") {
      await env.BILI_HISTORY_SYNC.delete("history.json");
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: cors,
    });
  },
};
