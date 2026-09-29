import { createHmac, timingSafeEqual } from "node:crypto";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const SECRETS = ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET"];

initializeApp();

export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const tokenRef = (shopId) => db.doc(`private/${shopId}/integrations/shopify`);
const credentials = () => ({ client_id: process.env.SHOPIFY_API_KEY, client_secret: process.env.SHOPIFY_API_SECRET });
const sign = (data, encoding) => createHmac("sha256", process.env.SHOPIFY_API_SECRET).update(data).digest(encoding);
const graphql = (shopId, accessToken, query, variables) =>
  post(`https://${shopId}/admin/api/2026-10/graphql.json`, { query, variables }, { "X-Shopify-Access-Token": accessToken });

export const getAdminUrl = (shopId, path, params = {}) =>
  `https://${shopId}/admin/apps/${process.env.SHOPIFY_API_KEY}${path}?${new URLSearchParams(params)}`;

export const queryAdmin = async (shopId, query, variables) => graphql(shopId, await accessToken(shopId), query, variables);

export const createSchedule = (schedule, run, { secrets = [], timeZone } = {}) =>
  onSchedule({ schedule, timeZone, secrets: [...SECRETS, ...secrets] }, run);

export async function getPlan(shopId) {
  const { data, errors } = await queryAdmin(shopId, "{ currentAppInstallation { activeSubscriptions { name } } }");
  if (!data) throw new Error(`Can't read the plan of ${shopId}: ${JSON.stringify(errors)}`);
  return data.currentAppInstallation.activeSubscriptions[0]?.name ?? null;
}

export async function sendAppEvent(shopId, handle, key) {
  const [{ shopGid }, token] = await Promise.all([
    tokenRef(shopId).get().then((doc) => doc.data()),
    post("https://api.shopify.com/auth/access_token", { ...credentials(), grant_type: "client_credentials" }),
  ]);
  await post(
    "https://api.shopify.com/app/2026-07/events",
    {
      shop_id: shopGid,
      event_handle: handle,
      timestamp: new Date().toISOString(),
      idempotency_key: key,
      attributes: { value: 1 },
    },
    { Authorization: `Bearer ${token.access_token}` },
  );
}

export function createFunctions(appRoutes = {}, { secrets = [] } = {}) {
  const routes = {
    "/api/auth": async (req, res, { shopId, payload, token }) => {
      const [firebaseToken] = await Promise.all([
        getAuth().createCustomToken(`${shopId}_${payload.sub}`, { shopId }),
        grant(shopId, {
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token: token,
          subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
          requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
          expiring: "1",
        }).then(async (fresh) => {
          const shop = await graphql(shopId, fresh.accessToken, "{ shop { id } }");
          await tokenRef(shopId).set({ ...fresh, shopGid: shop.data.shop.id });
        }),
      ]);
      res.json({ token: firebaseToken });
    },
    ...appRoutes,
  };

  return {
    api: onRequest({ secrets: [...SECRETS, ...secrets] }, async (req, res) => {
      const route = routes[req.path];
      if (!route) return res.status(404).json({ error: "not found" });

      const context = req.path.startsWith("/api/public/")
        ? {}
        : req.path.startsWith("/api/webhooks/")
          ? verifyWebhook(req)
          : verifySession(req.get("authorization")?.replace(/^Bearer /, ""));
      if (!context) {
        return res.set("X-Shopify-Retry-Invalid-Session-Request", "1").status(401).json({ error: "unauthorized" });
      }

      await route(req, res, context);
      if (!res.headersSent) res.status(200).end();
    }),
    emulator: onRequest(async (req, res) => {
      const port = req.path.startsWith("/google.firestore.") ? 4620 : 4610;
      const upstream = await fetch(new URL(req.originalUrl, `http://127.0.0.1:${port}`), {
        method: req.method,
        headers: { "content-type": req.get("content-type") ?? "application/json" },
        body: req.rawBody,
      });
      res.status(upstream.status).send(await upstream.text());
    }),
  };
}

async function accessToken(shopId) {
  const snapshot = await tokenRef(shopId).get();
  const stored = snapshot.data();
  if (stored.expiresAt > Date.now() + 300_000) return stored.accessToken;

  const fresh = await grant(shopId, { grant_type: "refresh_token", refresh_token: stored.refreshToken });
  await tokenRef(shopId).update(fresh, { lastUpdateTime: snapshot.updateTime }).catch(() => {});
  return fresh.accessToken;
}

async function grant(shopId, params) {
  const token = await post(`https://${shopId}/admin/oauth/access_token`, { ...credentials(), ...params });
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
}

function verifyWebhook(req) {
  const shopId = req.get("x-shopify-shop-domain");
  return shopId && same(req.get("x-shopify-hmac-sha256"), sign(req.rawBody ?? "", "base64")) && { shopId };
}

function verifySession(token = "") {
  const [header, body, signature] = token.split(".");
  if (!same(signature, sign(`${header}.${body}`, "base64url"))) return null;

  const payload = JSON.parse(Buffer.from(body, "base64url"));
  const shopId = new URL(payload.dest).hostname;
  const now = Date.now() / 1000;
  const valid =
    payload.aud === process.env.SHOPIFY_API_KEY &&
    payload.exp + 10 > now &&
    (payload.nbf ?? 0) - 10 < now &&
    new URL(payload.iss).hostname === shopId;
  return valid ? { shopId, payload, token } : null;
}

async function post(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url} ${await response.text()}`);
  return response.json().catch(() => null);
}

function same(a = "", b) {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
}
