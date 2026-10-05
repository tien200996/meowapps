import { createHmac, timingSafeEqual } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'

export class MeowBackend {
  static appDatabase = MeowBackend.#connectDatabase()
  static #secretNames = ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET']
  static #adminVersion = '2026-10'
  static #eventsUrl = 'https://api.shopify.com/app/2026-07/events'
  static #credentialsUrl = 'https://api.shopify.com/auth/access_token'
  static #authRoute = '/api/auth'
  static #publicPrefix = '/api/public/'
  static #webhookPrefix = '/api/webhooks/'
  static #firestorePrefix = '/google.firestore.'
  static #bearerPattern = /^Bearer /
  static #retryHeader = 'X-Shopify-Retry-Invalid-Session-Request'
  static #clockSkew = 10
  static #secondMillis = 1000
  static #refreshMargin = 300_000
  static #requestTimeout = 10_000
  static #usageUnits = 1
  static #conflictCode = 9
  static #shopQuery = '{ shop { id } }'
  static #planQuery = '{ currentAppInstallation { activeSubscriptions { name } } }'
  static #exchangeGrant = {
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
    expiring: '1',
  }

  static createFunctions(appRoutes = {}, { secretNames = [] } = {}) {
    const allRoutes = { [MeowBackend.#authRoute]: MeowBackend.#exchangeToken, ...appRoutes }
    return {
      handleApi: onRequest(
        { secrets: [...MeowBackend.#secretNames, ...secretNames] },
        (httpRequest, httpResponse) => MeowBackend.#handleRequest(allRoutes, httpRequest, httpResponse),
      ),
      proxyEmulator: onRequest(MeowBackend.#proxyRequest),
    }
  }

  static createSchedule(scheduleText, scheduleTask, { secretNames = [], timeZone } = {}) {
    return onSchedule({ schedule: scheduleText, timeZone, secrets: [...MeowBackend.#secretNames, ...secretNames] }, scheduleTask)
  }

  static async getPlan(shopId) {
    const planAnswer = await MeowBackend.queryAdmin(shopId, MeowBackend.#planQuery)
    if (!planAnswer.data) throw new Error(`Can't read the plan of ${shopId}: ${JSON.stringify(planAnswer.errors)}`)
    return planAnswer.data.currentAppInstallation.activeSubscriptions[0]?.name ?? null
  }

  static async queryAdmin(shopId, adminQuery, queryVariables) {
    return MeowBackend.#postGraphql(shopId, await MeowBackend.#loadAccess(shopId), adminQuery, queryVariables)
  }

  static async reportUsage(shopId, eventHandle, actionId) {
    const [tokenSnapshot, appToken] = await Promise.all([
      MeowBackend.#readToken(shopId),
      MeowBackend.#postJson(MeowBackend.#credentialsUrl, { ...MeowBackend.#readCredentials(), grant_type: 'client_credentials' }),
    ])
    await MeowBackend.#postJson(
      MeowBackend.#eventsUrl,
      {
        shop_id: tokenSnapshot.get('shopGid'),
        event_handle: eventHandle,
        timestamp: new Date().toISOString(),
        idempotency_key: actionId,
        attributes: { value: MeowBackend.#usageUnits },
      },
      { Authorization: `Bearer ${appToken.access_token}` },
    )
  }

  static embedPath(shopId, appPath, pathParams = {}) {
    return `https://${shopId}/admin/apps/${process.env.SHOPIFY_API_KEY}${appPath}?${new URLSearchParams(pathParams)}`
  }

  static #connectDatabase() {
    initializeApp()
    const appDatabase = getFirestore()
    appDatabase.settings({ ignoreUndefinedProperties: true })
    return appDatabase
  }

  static async #exchangeToken(httpRequest, httpResponse, { shopId, sessionPayload, sessionToken }) {
    const [customToken] = await Promise.all([
      getAuth().createCustomToken(`${shopId}_${sessionPayload.sub}`, { shopId }),
      MeowBackend.#storeToken(shopId, sessionToken),
    ])
    httpResponse.json({ customToken })
  }

  static async #handleRequest(allRoutes, httpRequest, httpResponse) {
    if (!Object.hasOwn(allRoutes, httpRequest.path)) return httpResponse.status(404).json({ errorMessage: 'not found' })
    const routeContext = MeowBackend.#verifyRequest(httpRequest)
    if (!routeContext) return httpResponse.set(MeowBackend.#retryHeader, '1').status(401).json({ errorMessage: 'unauthorized' })
    await allRoutes[httpRequest.path](httpRequest, httpResponse, routeContext)
    if (!httpResponse.headersSent) httpResponse.status(200).end()
  }

  static async #proxyRequest(httpRequest, httpResponse) {
    const emulatorHost = MeowBackend.#findEmulator(httpRequest.path)
    if (!emulatorHost) return httpResponse.status(404).json({ errorMessage: 'not found' })
    const upstreamResponse = await fetch(`http://${emulatorHost}${httpRequest.originalUrl}`, {
      method: httpRequest.method,
      headers: { 'content-type': httpRequest.get('content-type') ?? 'application/json' },
      body: httpRequest.rawBody,
    })
    httpResponse.status(upstreamResponse.status).send(await upstreamResponse.text())
  }

  static async #loadAccess(shopId) {
    const tokenSnapshot = await MeowBackend.#readToken(shopId)
    const storedToken = tokenSnapshot.data()
    if (storedToken.expireTime > Date.now() + MeowBackend.#refreshMargin) return storedToken.accessToken
    const freshToken = await MeowBackend.#grantToken(shopId, { grant_type: 'refresh_token', refresh_token: storedToken.refreshToken })
    await MeowBackend.#locateToken(shopId)
      .update(freshToken, { lastUpdateTime: tokenSnapshot.updateTime })
      .catch(MeowBackend.#ignoreConflict)
    return freshToken.accessToken
  }

  static async #storeToken(shopId, sessionToken) {
    const freshToken = await MeowBackend.#grantToken(shopId, { ...MeowBackend.#exchangeGrant, subject_token: sessionToken })
    const shopAnswer = await MeowBackend.#postGraphql(shopId, freshToken.accessToken, MeowBackend.#shopQuery)
    await MeowBackend.#locateToken(shopId).set({ ...freshToken, shopGid: shopAnswer.data.shop.id })
  }

  static #verifyRequest(httpRequest) {
    if (httpRequest.path.startsWith(MeowBackend.#publicPrefix)) return {}
    if (httpRequest.path.startsWith(MeowBackend.#webhookPrefix)) return MeowBackend.#verifyWebhook(httpRequest)
    return MeowBackend.#verifySession(httpRequest.get('authorization')?.replace(MeowBackend.#bearerPattern, ''))
  }

  static #findEmulator(requestPath) {
    if (process.env.FUNCTIONS_EMULATOR !== 'true') return null
    if (requestPath.startsWith(MeowBackend.#firestorePrefix)) return process.env.FIRESTORE_EMULATOR_HOST
    return process.env.FIREBASE_AUTH_EMULATOR_HOST
  }

  static #ignoreConflict(updateError) {
    if (updateError.code !== MeowBackend.#conflictCode) throw updateError
  }

  static #verifyWebhook(httpRequest) {
    const shopId = httpRequest.get('x-shopify-shop-domain')
    const expectedSignature = MeowBackend.#signText(httpRequest.rawBody ?? '', 'base64')
    const matchFlag = MeowBackend.#compareSignature(httpRequest.get('x-shopify-hmac-sha256'), expectedSignature)
    return shopId && matchFlag ? { shopId } : null
  }

  static #verifySession(sessionToken = '') {
    const [tokenHeader, tokenBody, tokenSignature] = sessionToken.split('.')
    if (!MeowBackend.#compareSignature(tokenSignature, MeowBackend.#signText(`${tokenHeader}.${tokenBody}`, 'base64url'))) return null
    const sessionPayload = JSON.parse(Buffer.from(tokenBody, 'base64url'))
    const shopId = new URL(sessionPayload.dest).hostname
    const currentTime = Date.now() / MeowBackend.#secondMillis
    const validFlag = sessionPayload.aud === process.env.SHOPIFY_API_KEY
      && sessionPayload.exp + MeowBackend.#clockSkew > currentTime
      && (sessionPayload.nbf ?? 0) - MeowBackend.#clockSkew < currentTime
      && new URL(sessionPayload.iss).hostname === shopId
    return validFlag ? { shopId, sessionPayload, sessionToken } : null
  }

  static #postGraphql(shopId, accessToken, adminQuery, queryVariables) {
    return MeowBackend.#postJson(
      `https://${shopId}/admin/api/${MeowBackend.#adminVersion}/graphql.json`,
      { query: adminQuery, variables: queryVariables },
      { 'X-Shopify-Access-Token': accessToken },
    )
  }

  static async #readToken(shopId) {
    const tokenSnapshot = await MeowBackend.#locateToken(shopId).get()
    if (!tokenSnapshot.exists) throw new Error(`No Shopify token for ${shopId}: open the app once on that store`)
    return tokenSnapshot
  }

  static async #postJson(requestUrl, requestBody, extraHeaders = {}) {
    const fetchResponse = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(MeowBackend.#requestTimeout),
    })
    if (!fetchResponse.ok) throw new Error(`${fetchResponse.status} ${requestUrl} ${await fetchResponse.text()}`)
    return fetchResponse.json().catch(() => null)
  }

  static #readCredentials() {
    return { client_id: process.env.SHOPIFY_API_KEY, client_secret: process.env.SHOPIFY_API_SECRET }
  }

  static async #grantToken(shopId, grantParams) {
    const tokenAnswer = await MeowBackend.#postJson(`https://${shopId}/admin/oauth/access_token`, { ...MeowBackend.#readCredentials(), ...grantParams })
    return {
      accessToken: tokenAnswer.access_token,
      refreshToken: tokenAnswer.refresh_token,
      expireTime: Date.now() + tokenAnswer.expires_in * MeowBackend.#secondMillis,
    }
  }

  static #locateToken(shopId) {
    return MeowBackend.appDatabase.doc(`private/${shopId}/integrations/shopify`)
  }

  static #signText(signedText, textEncoding) {
    return createHmac('sha256', process.env.SHOPIFY_API_SECRET).update(signedText).digest(textEncoding)
  }

  static #compareSignature(givenSignature = '', expectedSignature) {
    const givenBuffer = Buffer.from(givenSignature)
    const expectedBuffer = Buffer.from(expectedSignature)
    return givenBuffer.length === expectedBuffer.length && timingSafeEqual(givenBuffer, expectedBuffer)
  }
}
