const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "Content-Type, X-Owner-Key"
    }
  });

const asNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function ownerAuthorized(request, env) {
  const supplied = request.headers.get("X-Owner-Key") || "";
  return Boolean(env.OWNER_API_KEY && supplied && supplied === env.OWNER_API_KEY);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "Content-Type, X-Owner-Key"
    }});

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        const result = await env.DB.prepare("SELECT 1 AS ok").first();
        return json({ ok: result?.ok === 1, service: "ams-v2-api", database: "connected" });
      }

      if (url.pathname === "/api/phone-models" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT id, brand, model_name, active FROM phone_models WHERE active = 1 ORDER BY brand, model_name"
        ).all();
        return json({ ok: true, data: results });
      }

      if (url.pathname === "/api/repair-pricing" && request.method === "GET") {
        const modelId = asNumber(url.searchParams.get("phone_model_id"));
        let query = `SELECT rp.id, rp.phone_model_id, pm.brand, pm.model_name,
                            rp.repair_issue, rp.min_price, rp.max_price
                     FROM repair_pricing rp
                     JOIN phone_models pm ON pm.id = rp.phone_model_id
                     WHERE rp.active = 1 AND pm.active = 1`;
        let statement;
        if (modelId !== null) {
          statement = env.DB.prepare(query + " AND rp.phone_model_id = ? ORDER BY rp.repair_issue").bind(modelId);
        } else {
          statement = env.DB.prepare(query + " ORDER BY pm.brand, pm.model_name, rp.repair_issue");
        }
        const { results } = await statement.all();
        return json({ ok: true, data: results });
      }

      if (url.pathname === "/api/repair-requests" && request.method === "POST") {
        const body = await request.json();
        const name = String(body.name || "").trim().slice(0, 100);
        const phone = String(body.phone || "").trim().slice(0, 30);
        const issue = String(body.repair_issue || "").trim().slice(0, 300);
        const modelId = asNumber(body.phone_model_id);
        if (!name || !phone || !issue || modelId === null) {
          return json({ ok: false, error: "name, phone, phone_model_id and repair_issue are required" }, 400);
        }
        const model = await env.DB.prepare(
          "SELECT id FROM phone_models WHERE id = ? AND active = 1"
        ).bind(modelId).first();
        if (!model) return json({ ok: false, error: "Unknown phone model" }, 400);

        // Save the request as a booking record; inspect the existing bookings schema before enabling this route.
        return json({ ok: false, error: "Repair request saving is not enabled yet. Existing bookings schema must be checked first." }, 501);
      }

      if (url.pathname.startsWith("/api/owner/")) {
        if (!ownerAuthorized(request, env)) return json({ ok: false, error: "Unauthorized" }, 401);

        if (url.pathname === "/api/owner/phone-models" && request.method === "POST") {
          const body = await request.json();
          const brand = String(body.brand || "").trim().slice(0, 60);
          const modelName = String(body.model_name || "").trim().slice(0, 100);
          if (!brand || !modelName) return json({ ok: false, error: "brand and model_name are required" }, 400);
          await env.DB.prepare(
            "INSERT INTO phone_models (brand, model_name, active) VALUES (?, ?, 1) ON CONFLICT(brand, model_name) DO UPDATE SET active = 1"
          ).bind(brand, modelName).run();
          return json({ ok: true });
        }

        if (url.pathname === "/api/owner/repair-pricing" && request.method === "POST") {
          const body = await request.json();
          const modelId = asNumber(body.phone_model_id);
          const issue = String(body.repair_issue || "").trim().slice(0, 120);
          const min = asNumber(body.min_price);
          const max = asNumber(body.max_price);
          if (modelId === null || !issue || min === null || max === null || min < 0 || max < min) {
            return json({ ok: false, error: "Valid phone_model_id, repair_issue, min_price and max_price are required" }, 400);
          }
          await env.DB.prepare(
            `INSERT INTO repair_pricing (phone_model_id, repair_issue, min_price, max_price, active)
             VALUES (?, ?, ?, ?, 1)
             ON CONFLICT(phone_model_id, repair_issue)
             DO UPDATE SET min_price = excluded.min_price, max_price = excluded.max_price, active = 1`
          ).bind(modelId, issue, min, max).run();
          return json({ ok: true });
        }

        if (url.pathname === "/api/owner/inventory" && request.method === "POST") {
          const body = await request.json();
          const modelId = asNumber(body.phone_model_id);
          const condition = String(body.condition || "used").trim().slice(0, 30);
          const storage = String(body.storage_variant || "").trim().slice(0, 40);
          const color = String(body.color || "").trim().slice(0, 40);
          const purchase = asNumber(body.purchase_price);
          const selling = asNumber(body.selling_price);
          const quantity = asNumber(body.quantity);
          if (modelId === null || purchase === null || selling === null || quantity === null || purchase < 0 || selling < 0 || quantity < 0) {
            return json({ ok: false, error: "Valid model, prices and quantity are required" }, 400);
          }
          await env.DB.prepare(
            `INSERT INTO phone_inventory
             (phone_model_id, condition, storage_variant, color, purchase_price, selling_price, quantity, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`
          ).bind(modelId, condition, storage || null, color || null, purchase, selling, Math.floor(quantity)).run();
          return json({ ok: true });
        }
      }

      if (url.pathname.startsWith("/api/")) return json({ ok: false, error: "Not found" }, 404);
      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ ok: false, error: "Server error", detail: env.ENVIRONMENT === "development" ? String(error) : undefined }, 500);
    }
  }
};
