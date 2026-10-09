import { createHash, createHmac, generateKeyPairSync, randomBytes, sign, timingSafeEqual } from 'node:crypto'
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
  static #identityRoute = '/api/identity'
  static #publicPrefix = '/api/public/'
  static #webhookPrefix = '/api/webhooks/'
  static #proxyPrefix = '/api/proxy/'
  static #firestorePrefix = '/google.firestore.'
  static #bearerPattern = /^Bearer /
  static #basicPattern = /^Basic /
  static #shopPattern = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/
  static #retryHeader = 'X-Shopify-Retry-Invalid-Session-Request'
  static #clockSkew = 10
  static #secondMillis = 1000
  static #refreshMargin = 300_000
  static #requestTimeout = 10_000
  static #ticketLifetime = 1_800_000
  static #codeLifetime = 60_000
  static #accessLifetime = 3_600_000
  static #grantLifetime = 7_776_000_000
  static #secretBytes = 32
  static #keySize = 2048
  static #warmInstances = 1
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
  static #domainQuery = '{ shop { id primaryDomain { host } customerAccountsV2 { url } } }'
  static #secureProtocol = 'https:'
  static #shopifyHost = 'shopify.com'
  static #storeSuffix = '.myshopify.com'
  static #accountSuffix = '.account.myshopify.com'
  static #shopifyLogin = '/customer_authentication/'
  static #identityPath = '/api/public/identity'
  static #entriesPath = 'system/identity/temp'
  static #grantsPath = 'system/identity/grants'
  static #keysPath = 'system/identity/keys'
  static #ticketKind = 'ticket'
  static #codeKind = 'code'
  static #accessKind = 'access'
  static #signingAlgorithm = 'RS256'
  static #challengeMethod = 'S256'
  static #grantTypes = ['authorization_code', 'refresh_token']
  static #identityRoutes = {
    [`${MeowBackend.#identityPath}/.well-known/openid-configuration`]: MeowBackend.#describeIdentity,
    [`${MeowBackend.#identityPath}/authorize`]: MeowBackend.#authorizeIdentity,
    [`${MeowBackend.#identityPath}/token`]: MeowBackend.#issueIdentity,
    [`${MeowBackend.#identityPath}/.well-known/jwks.json`]: MeowBackend.#publishKeys,
    [`${MeowBackend.#identityPath}/userinfo`]: MeowBackend.#readIdentity,
    [`${MeowBackend.#identityPath}/logout`]: MeowBackend.#endIdentity,
  }
  static #signingKey = null

  static createFunctions(appRoutes = {}, { secretNames = [] } = {}) {
    const allRoutes = {
      [MeowBackend.#authRoute]: MeowBackend.#exchangeToken,
      [MeowBackend.#identityRoute]: MeowBackend.#saveIdentity,
      ...appRoutes,
    }
    return {
      handleApi: onRequest(
        { secrets: [...MeowBackend.#secretNames, ...secretNames] },
        (httpRequest, httpResponse) => MeowBackend.#handleRequest(allRoutes, httpRequest, httpResponse),
      ),
      proxyEmulator: onRequest(MeowBackend.#proxyRequest),
      handleIdentity: onRequest(
        { secrets: MeowBackend.#secretNames, minInstances: MeowBackend.#warmInstances },
        (httpRequest, httpResponse) => MeowBackend.#handleRequest(MeowBackend.#identityRoutes, httpRequest, httpResponse),
      ),
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

  static async approveIdentity(shopId, ticketId, customerClaims) {
    if (!customerClaims.sub || !customerClaims.email || customerClaims.email_verified !== true) {
      throw new Error('approveIdentity needs customerClaims with sub, email and email_verified: true')
    }
    const ticketEntry = await MeowBackend.#consumeEntry(ticketId, MeowBackend.#ticketKind)
    if (ticketEntry?.shopId !== shopId) return null
    const authCode = await MeowBackend.#storeEntry(MeowBackend.#codeKind, MeowBackend.#codeLifetime, { ...ticketEntry, customerClaims })
    return MeowBackend.#buildUrl(ticketEntry.redirectUrl, { code: authCode, state: ticketEntry.requestState })
  }

  static async revokeIdentity(shopId, customerSub) {
    const grantSnapshot = await MeowBackend.appDatabase
      .collection(MeowBackend.#grantsPath)
      .where('shopId', '==', shopId)
      .where('customerSub', '==', customerSub)
      .get()
    await Promise.all(grantSnapshot.docs.map(grantDoc => grantDoc.ref.delete()))
  }

  static #connectDatabase() {
    initializeApp()
    const appDatabase = getFirestore()
    appDatabase.settings({ ignoreUndefinedProperties: true })
    return appDatabase
  }

  static #describeIdentity(httpRequest, httpResponse) {
    const issuerUrl = MeowBackend.#findIssuer(httpRequest)
    httpResponse.json({
      issuer: issuerUrl,
      authorization_endpoint: `${issuerUrl}/authorize`,
      token_endpoint: `${issuerUrl}/token`,
      jwks_uri: `${issuerUrl}/.well-known/jwks.json`,
      userinfo_endpoint: `${issuerUrl}/userinfo`,
      end_session_endpoint: `${issuerUrl}/logout`,
      response_types_supported: ['code'],
      grant_types_supported: MeowBackend.#grantTypes,
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: [MeowBackend.#signingAlgorithm],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      code_challenge_methods_supported: [MeowBackend.#challengeMethod],
      scopes_supported: ['openid', 'email', 'profile', 'phone', 'address', 'offline_access'],
    })
  }

  static async #authorizeIdentity(httpRequest, httpResponse) {
    const authorizeParams = { ...httpRequest.query, ...httpRequest.body }
    const clientData = await MeowBackend.#loadClient(authorizeParams.client_id)
    if (clientData && !clientData.loginUrl) console.error(`No login page for ${authorizeParams.client_id}`)
    const allowFlag = clientData?.loginUrl && await MeowBackend.#checkReturn(authorizeParams.client_id, authorizeParams.redirect_uri)
    if (!allowFlag) return httpResponse.status(400).json({ error: 'invalid_request' })
    const refusalCode = MeowBackend.#findRefusal(authorizeParams)
    if (refusalCode) {
      return httpResponse.redirect(MeowBackend.#buildUrl(authorizeParams.redirect_uri, { error: refusalCode, state: authorizeParams.state }))
    }
    const ticketId = await MeowBackend.#storeEntry(MeowBackend.#ticketKind, MeowBackend.#ticketLifetime, {
      shopId: authorizeParams.client_id,
      redirectUrl: authorizeParams.redirect_uri,
      requestState: authorizeParams.state,
      requestNonce: authorizeParams.nonce,
      requestScope: authorizeParams.scope,
      codeChallenge: authorizeParams.code_challenge,
    })
    httpResponse.redirect(MeowBackend.#buildUrl(clientData.loginUrl, { ticketId }))
  }

  static async #issueIdentity(httpRequest, httpResponse) {
    const tokenParams = httpRequest.body ?? {}
    const clientId = await MeowBackend.#verifyClient(httpRequest.get('authorization'), tokenParams)
    if (!clientId) return httpResponse.status(401).json({ error: 'invalid_client' })
    if (!MeowBackend.#grantTypes.includes(tokenParams.grant_type)) return httpResponse.status(400).json({ error: 'unsupported_grant_type' })
    const grantData = tokenParams.grant_type === 'authorization_code'
      ? await MeowBackend.#redeemCode(clientId, tokenParams)
      : await MeowBackend.#refreshGrant(clientId, tokenParams)
    if (!grantData) return httpResponse.status(400).json({ error: 'invalid_grant' })
    httpResponse.set('Cache-Control', 'no-store').json(await MeowBackend.#signTokens(MeowBackend.#findIssuer(httpRequest), clientId, grantData))
  }

  static async #publishKeys(httpRequest, httpResponse) {
    const keySnapshot = await MeowBackend.appDatabase.collection(MeowBackend.#keysPath).get()
    const publicKeys = keySnapshot.docs.map(keyDoc => ({
      ...keyDoc.get('publicKey'),
      kid: keyDoc.id,
      use: 'sig',
      alg: MeowBackend.#signingAlgorithm,
    }))
    httpResponse.json({ keys: publicKeys })
  }

  static async #readIdentity(httpRequest, httpResponse) {
    const accessToken = httpRequest.get('authorization')?.replace(MeowBackend.#bearerPattern, '')
    const accessEntry = MeowBackend.#checkEntry(await MeowBackend.#locateEntry(accessToken).get(), MeowBackend.#accessKind)
    if (!accessEntry) return httpResponse.status(401).json({ error: 'invalid_token' })
    httpResponse.json(accessEntry.customerClaims)
  }

  static async #endIdentity(httpRequest, httpResponse) {
    const logoutParams = { ...httpRequest.query, ...httpRequest.body }
    const clientId = logoutParams.client_id ?? MeowBackend.#readAudience(logoutParams.id_token_hint)
    const logoutUrl = logoutParams.post_logout_redirect_uri
    const clientData = await MeowBackend.#loadClient(clientId)
    if (!clientData || !await MeowBackend.#checkReturn(clientId, logoutUrl)) return httpResponse.status(400).json({ error: 'invalid_request' })
    httpResponse.redirect(MeowBackend.#buildUrl(logoutUrl, { state: logoutParams.state }))
  }

  static async #exchangeToken(httpRequest, httpResponse, { shopId, sessionPayload, sessionToken }) {
    const [customToken] = await Promise.all([
      getAuth().createCustomToken(`${shopId}_${sessionPayload.sub}`, { shopId }),
      MeowBackend.#storeToken(shopId, sessionToken),
    ])
    httpResponse.json({ customToken })
  }

  static async #saveIdentity(httpRequest, httpResponse, { shopId }) {
    const { loginUrl } = httpRequest.body ?? {}
    const loginPage = typeof loginUrl === 'string' && URL.canParse(loginUrl) && new URL(loginUrl)
    const validFlag = !loginUrl || (loginPage
      && loginPage.protocol === MeowBackend.#secureProtocol
      && !loginPage.pathname.startsWith(MeowBackend.#shopifyLogin))
    if (!validFlag) return httpResponse.status(400).json({ errorMessage: 'loginUrl must be the https URL of your own login page' })
    const identityDoc = MeowBackend.#locateIdentity(shopId)
    const savedIdentity = (await identityDoc.get()).data() ?? { clientSecret: MeowBackend.#createSecret() }
    const identityData = loginUrl ? { ...savedIdentity, loginUrl } : savedIdentity
    await identityDoc.set(identityData)
    httpResponse.json({ ...identityData, discoveryUrl: `${MeowBackend.#findIssuer(httpRequest)}/.well-known/openid-configuration`, clientId: shopId })
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
    if (storedToken.expireTime.toMillis() > Date.now() + MeowBackend.#refreshMargin) return storedToken.accessToken
    const freshToken = await MeowBackend.#grantToken(shopId, { grant_type: 'refresh_token', refresh_token: storedToken.refreshToken })
    await MeowBackend.#locateToken(shopId)
      .update(freshToken, { lastUpdateTime: tokenSnapshot.updateTime })
      .catch(MeowBackend.#ignoreConflict)
    return freshToken.accessToken
  }

  static #findRefusal({ response_type, scope, prompt, code_challenge, code_challenge_method }) {
    if (response_type !== 'code') return 'unsupported_response_type'
    if (!String(scope).split(' ').includes('openid')) return 'invalid_scope'
    if (code_challenge && code_challenge_method !== MeowBackend.#challengeMethod) return 'invalid_request'
    if (String(prompt).split(' ').includes('none')) return 'login_required'
    return null
  }

  static async #verifyClient(authorizationHeader = '', { client_id, client_secret }) {
    const [clientId, clientSecret] = MeowBackend.#basicPattern.test(authorizationHeader)
      ? Buffer.from(authorizationHeader.replace(MeowBackend.#basicPattern, ''), 'base64').toString().split(':')
      : [client_id, client_secret]
    const clientData = await MeowBackend.#loadClient(clientId)
    return clientData && MeowBackend.#compareSignature(clientSecret, clientData.clientSecret) ? clientId : null
  }

  static async #redeemCode(clientId, { code, redirect_uri, code_verifier }) {
    const codeEntry = await MeowBackend.#consumeEntry(code, MeowBackend.#codeKind)
    if (codeEntry?.shopId !== clientId || codeEntry.redirectUrl !== redirect_uri) return null
    if (codeEntry.codeChallenge && !MeowBackend.#compareSignature(MeowBackend.#hashText(code_verifier), codeEntry.codeChallenge)) return null
    const refreshToken = MeowBackend.#createSecret()
    await MeowBackend.#locateGrant(refreshToken).set({
      shopId: clientId,
      customerSub: codeEntry.customerClaims.sub,
      customerClaims: codeEntry.customerClaims,
      requestScope: codeEntry.requestScope,
      saveTime: Date.now(),
      expireTime: new Date(Date.now() + MeowBackend.#grantLifetime),
    })
    return { customerClaims: codeEntry.customerClaims, requestNonce: codeEntry.requestNonce, requestScope: codeEntry.requestScope, refreshToken }
  }

  static async #refreshGrant(clientId, { refresh_token }) {
    const grantEntry = (await MeowBackend.#locateGrant(refresh_token).get()).data()
    if (grantEntry?.shopId !== clientId || grantEntry.expireTime.toMillis() < Date.now()) return null
    return { customerClaims: grantEntry.customerClaims, requestScope: grantEntry.requestScope, refreshToken: refresh_token }
  }

  static async #signTokens(issuerUrl, clientId, { customerClaims, requestNonce, requestScope, refreshToken }) {
    const [signingKey, accessToken] = await Promise.all([
      MeowBackend.#loadKey(),
      MeowBackend.#storeEntry(MeowBackend.#accessKind, MeowBackend.#accessLifetime, { shopId: clientId, customerClaims }),
    ])
    const issueTime = Math.floor(Date.now() / MeowBackend.#secondMillis)
    const expireSeconds = MeowBackend.#accessLifetime / MeowBackend.#secondMillis
    const tokenHeader = MeowBackend.#encodeJson({ alg: MeowBackend.#signingAlgorithm, typ: 'JWT', kid: signingKey.keyId })
    const tokenBody = MeowBackend.#encodeJson({
      ...customerClaims,
      iss: issuerUrl,
      aud: clientId,
      iat: issueTime,
      exp: issueTime + expireSeconds,
      nonce: requestNonce,
    })
    const tokenSignature = sign('sha256', Buffer.from(`${tokenHeader}.${tokenBody}`), signingKey.privateKey).toString('base64url')
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expireSeconds,
      id_token: `${tokenHeader}.${tokenBody}.${tokenSignature}`,
      refresh_token: refreshToken,
      scope: requestScope,
    }
  }

  static #readAudience(tokenHint) {
    try {
      return JSON.parse(Buffer.from(tokenHint.split('.')[1], 'base64url')).aud
    } catch {
      return null
    }
  }

  static async #storeToken(shopId, sessionToken) {
    const freshToken = await MeowBackend.#grantToken(shopId, { ...MeowBackend.#exchangeGrant, subject_token: sessionToken })
    const shopAnswer = await MeowBackend.#postGraphql(shopId, freshToken.accessToken, MeowBackend.#shopQuery)
    await MeowBackend.#locateToken(shopId).set({ ...freshToken, shopGid: shopAnswer.data.shop.id })
  }

  static #verifyRequest(httpRequest) {
    if (httpRequest.path.startsWith(MeowBackend.#publicPrefix)) return {}
    if (httpRequest.path.startsWith(MeowBackend.#webhookPrefix)) return MeowBackend.#verifyWebhook(httpRequest)
    if (httpRequest.path.startsWith(MeowBackend.#proxyPrefix)) return MeowBackend.#verifyProxy(httpRequest)
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

  static async #loadKey() {
    if (MeowBackend.#signingKey) return MeowBackend.#signingKey
    const keysCollection = MeowBackend.appDatabase.collection(MeowBackend.#keysPath)
    const [savedKey] = (await keysCollection.orderBy('saveTime', 'desc').limit(1).get()).docs
    if (savedKey) {
      MeowBackend.#signingKey = { keyId: savedKey.id, privateKey: savedKey.get('privateKey') }
      return MeowBackend.#signingKey
    }
    const keyPair = generateKeyPairSync('rsa', { modulusLength: MeowBackend.#keySize })
    const keyDoc = keysCollection.doc()
    const pemKey = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' })
    await keyDoc.create({ privateKey: pemKey, publicKey: keyPair.publicKey.export({ format: 'jwk' }), saveTime: Date.now() })
    MeowBackend.#signingKey = { keyId: keyDoc.id, privateKey: pemKey }
    return MeowBackend.#signingKey
  }

  static #encodeJson(jsonValue) {
    return Buffer.from(JSON.stringify(jsonValue)).toString('base64url')
  }

  static #verifyWebhook(httpRequest) {
    const shopId = httpRequest.get('x-shopify-shop-domain')
    const expectedSignature = MeowBackend.#signText(httpRequest.rawBody ?? '', 'base64')
    const matchFlag = MeowBackend.#compareSignature(httpRequest.get('x-shopify-hmac-sha256'), expectedSignature)
    return shopId && matchFlag ? { shopId } : null
  }

  static #verifyProxy(httpRequest) {
    const { signature, ...proxyParams } = httpRequest.query
    const signedText = Object.keys(proxyParams)
      .sort()
      .map(paramName => `${paramName}=${[proxyParams[paramName]].flat().join(',')}`)
      .join('')
    const matchFlag = MeowBackend.#compareSignature(signature, MeowBackend.#signText(signedText, 'hex'))
    return matchFlag ? { shopId: proxyParams.shop, customerId: proxyParams.logged_in_customer_id || null } : null
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

  static #consumeEntry(entrySecret, entryKind) {
    const entryDoc = MeowBackend.#locateEntry(entrySecret)
    return MeowBackend.appDatabase.runTransaction(async entryTransaction => {
      const entrySnapshot = await entryTransaction.get(entryDoc)
      if (entrySnapshot.exists) entryTransaction.delete(entryDoc)
      return MeowBackend.#checkEntry(entrySnapshot, entryKind)
    })
  }

  static async #storeEntry(entryKind, entryLifetime, entryData) {
    const entrySecret = MeowBackend.#createSecret()
    await MeowBackend.#locateEntry(entrySecret).set({ ...entryData, entryKind, expireTime: new Date(Date.now() + entryLifetime) })
    return entrySecret
  }

  static #buildUrl(baseUrl, urlParams) {
    const builtUrl = new URL(baseUrl)
    for (const [paramName, paramValue] of Object.entries(urlParams)) {
      if (paramValue) builtUrl.searchParams.set(paramName, paramValue)
    }
    return builtUrl.href
  }

  static #findIssuer(httpRequest) {
    const appHost = (httpRequest.get('x-forwarded-host') ?? httpRequest.get('host')).split(',')[0].trim()
    return `https://${appHost}${MeowBackend.#identityPath}`
  }

  static async #loadClient(clientId) {
    if (!MeowBackend.#shopPattern.test(clientId)) return null
    const identitySnapshot = await MeowBackend.#locateIdentity(clientId).get()
    return identitySnapshot.data() ?? null
  }

  static async #checkReturn(shopId, returnUrl) {
    if (!URL.canParse(returnUrl)) return false
    const { protocol, host, pathname } = new URL(returnUrl)
    const domainAnswer = await MeowBackend.queryAdmin(shopId, MeowBackend.#domainQuery)
    if (!domainAnswer.data?.shop) throw new Error(`Can't read the domains of ${shopId}: ${JSON.stringify(domainAnswer.errors)}`)
    const { id: shopGid, primaryDomain, customerAccountsV2 } = domainAnswer.data.shop
    const storeHandle = shopId.replace(MeowBackend.#storeSuffix, '')
    const shopHosts = [
      shopId,
      `${storeHandle}${MeowBackend.#accountSuffix}`,
      primaryDomain?.host,
      customerAccountsV2?.url && new URL(customerAccountsV2.url).host,
    ]
    const hostFlag = host === MeowBackend.#shopifyHost
      ? pathname.split('/').includes(shopGid.split('/').pop())
      : shopHosts.includes(host)
    const matchFlag = protocol === MeowBackend.#secureProtocol && hostFlag
    if (!matchFlag) console.error(`Refused return URL ${returnUrl} for ${shopId}`)
    return matchFlag
  }

  static #checkEntry(entrySnapshot, entryKind) {
    const entryData = entrySnapshot.data()
    return entryData?.entryKind === entryKind && entryData.expireTime.toMillis() > Date.now() ? entryData : null
  }

  static #locateEntry(entrySecret) {
    return MeowBackend.appDatabase.collection(MeowBackend.#entriesPath).doc(MeowBackend.#hashText(entrySecret))
  }

  static #locateIdentity(shopId) {
    return MeowBackend.appDatabase.doc(`private/${shopId}/integrations/identity`)
  }

  static #createSecret() {
    return randomBytes(MeowBackend.#secretBytes).toString('base64url')
  }

  static async #grantToken(shopId, grantParams) {
    const tokenAnswer = await MeowBackend.#postJson(`https://${shopId}/admin/oauth/access_token`, { ...MeowBackend.#readCredentials(), ...grantParams })
    return {
      accessToken: tokenAnswer.access_token,
      refreshToken: tokenAnswer.refresh_token,
      expireTime: new Date(Date.now() + tokenAnswer.expires_in * MeowBackend.#secondMillis),
    }
  }

  static #locateToken(shopId) {
    return MeowBackend.appDatabase.doc(`private/${shopId}/integrations/shopify`)
  }

  static #compareSignature(givenSignature = '', expectedSignature) {
    const givenBuffer = Buffer.from(givenSignature)
    const expectedBuffer = Buffer.from(expectedSignature)
    return givenBuffer.length === expectedBuffer.length && timingSafeEqual(givenBuffer, expectedBuffer)
  }

  static #hashText(plainText) {
    return createHash('sha256').update(String(plainText)).digest('base64url')
  }

  static #locateGrant(grantSecret) {
    return MeowBackend.appDatabase.collection(MeowBackend.#grantsPath).doc(MeowBackend.#hashText(grantSecret))
  }

  static #signText(signedText, textEncoding) {
    return createHmac('sha256', process.env.SHOPIFY_API_SECRET).update(signedText).digest(textEncoding)
  }
}
