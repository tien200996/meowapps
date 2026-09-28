import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { shopifyApi, ApiVersion } from "@shopify/shopify-api";
import "@shopify/shopify-api/adapters/node";

const SECRETS = ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "FIREBASE_API_KEY"];

initializeApp();

export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

export const adminUrl = (shopId, path, params = {}) =>
  `https://${shopId}/admin/apps/${process.env.SHOPIFY_API_KEY}${path}?${new URLSearchParams(params)}`;

export const createSchedule = (schedule, run, { secrets = [], timeZone } = {}) =>
  onSchedule({ schedule, timeZone, secrets }, run);

export const createFunctions = (appRoutes = {}, { secrets = [] } = {}) => {
  const routes = {
    "/api/public/config": (req, res) =>
      res.json({
        firebase: {
          apiKey: process.env.FUNCTIONS_EMULATOR ? "demo-key" : process.env.FIREBASE_API_KEY,
          projectId: process.env.GCLOUD_PROJECT,
        },
        authEmulator: !!process.env.FUNCTIONS_EMULATOR,
      }),
    "/api/auth": async (req, res, { shopId, payload }) =>
      res.json({ token: await getAuth().createCustomToken(`${shopId}_${payload.sub}`, { shopId }) }),
    ...appRoutes,
  };

  return {
    api: onRequest(
      { secrets: [...SECRETS, ...secrets] },
      async (req, res) => {
        const route = routes[req.path];
        if (!route) return res.status(404).json({ error: "not found" });

        const shopify = shopifyApi({
          apiKey: process.env.SHOPIFY_API_KEY,
          apiSecretKey: process.env.SHOPIFY_API_SECRET,
          hostName: req.hostname,
          apiVersion: ApiVersion.October26,
        });
        const token = req.get("authorization")?.replace(/^Bearer /, "");

        const context = req.path.startsWith("/api/public/")
          ? {}
          : req.path.startsWith("/api/webhooks/")
            ? await shopify.webhooks
                .validate({ rawBody: req.rawBody.toString(), rawRequest: req, rawResponse: res })
                .then((hook) => hook.valid && { shopId: hook.domain })
            : await shopify.session
                .decodeSessionToken(token)
                .then((payload) => ({ shopId: new URL(payload.dest).hostname, payload }), () => null);
        if (!context) return res.status(401).json({ error: "unauthorized" });

        await route(req, res, context);
        if (!res.headersSent) res.status(200).end();
      },
    ),
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
};
