import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'
import { connectAuthEmulator, getAuth, signInWithCustomToken } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  initializeFirestore,
  limit,
  orderBy,
  query,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js'

class SafeHtml {
  constructor(htmlText) {
    this.htmlText = htmlText
  }

  toString() {
    return this.htmlText
  }
}

class MeowApp extends HTMLElement {
  static #configUrl = '/__/firebase/init.json'
  static #authUrl = '/api/auth'
  static #adminUrl = 'shopify:admin/api/graphql.json'
  static #planQuery = '{ currentAppInstallation { app { handle } activeSubscriptions { name } } }'
  static #storeSuffix = '.myshopify.com'
  static #emulatorPrefix = 'demo-'
  static #shopsCollection = 'shops'
  static #timeField = 'saveTime'
  static #paramPrefix = ':'
  static #linkSelector = "[href^='/']"
  static #pageSelector = 'meow-app > *'
  static #saveSelector = 'ui-save-bar'
  static #escapePattern = /[&<>"']/g
  static #htmlEscapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  static #errorHeading = ''
  static #shopSession = MeowApp.#startSession()
  #pageRoutes = []

  static {
    customElements.define('meow-app', MeowApp)
  }

  connectedCallback() {
    MeowApp.#errorHeading = this.getAttribute('error-heading')
    this.#pageRoutes = this.#readRoutes()
    addEventListener('popstate', () => this.#showPage(location.pathname))
    this.addEventListener('click', clickEvent => this.#followLink(clickEvent))
    this.#showPage(location.pathname)
  }

  static buildHtml(htmlStrings, ...htmlValues) {
    return new SafeHtml(htmlStrings.reduce((htmlText, htmlString, stringIndex) =>
      `${htmlText}${MeowApp.#escapeValue(htmlValues[stringIndex - 1])}${htmlString}`))
  }

  static async readDoc(docPath) {
    const { appDatabase, shopId } = await MeowApp.#shopSession
    const docSnapshot = await getDoc(doc(appDatabase, MeowApp.#shopsCollection, shopId, docPath))
    return docSnapshot.data()
  }

  static async listDocs(collectionPath, { newestCount } = {}) {
    const { appDatabase, shopId } = await MeowApp.#shopSession
    const collectionReference = collection(appDatabase, MeowApp.#shopsCollection, shopId, collectionPath)
    const collectionQuery = newestCount
      ? query(collectionReference, orderBy(MeowApp.#timeField, 'desc'), limit(newestCount))
      : collectionReference
    const querySnapshot = await getDocs(collectionQuery)
    return querySnapshot.docs.map(docSnapshot => ({ docId: docSnapshot.id, ...docSnapshot.data() }))
  }

  static async writeDoc(docPath, docData) {
    const { appDatabase, shopId } = await MeowApp.#shopSession
    await setDoc(doc(appDatabase, MeowApp.#shopsCollection, shopId, docPath), docData, { merge: true })
  }

  static async callApi(apiPath, { httpMethod = 'GET', requestBody } = {}) {
    return MeowApp.#fetchJson(apiPath, {
      method: httpMethod,
      headers: await MeowApp.#buildHeaders(requestBody),
      body: MeowApp.#encodeBody(requestBody),
    })
  }

  static async queryAdmin(adminQuery, queryVariables) {
    return MeowApp.#fetchJson(MeowApp.#adminUrl, {
      method: 'POST',
      body: JSON.stringify({ query: adminQuery, variables: queryVariables }),
    })
  }

  static async readPlan() {
    const [{ shopId }, planAnswer] = await Promise.all([MeowApp.#shopSession, MeowApp.queryAdmin(MeowApp.#planQuery)])
    if (!planAnswer.data) throw new Error(`Can't read the plan of ${shopId}: ${JSON.stringify(planAnswer.errors)}`)
    const { app: appInstall, activeSubscriptions } = planAnswer.data.currentAppInstallation
    const storeHandle = shopId.replace(MeowApp.#storeSuffix, '')
    return {
      planName: activeSubscriptions[0]?.name ?? null,
      planUrl: `https://admin.shopify.com/store/${storeHandle}/charges/${appInstall.handle}/pricing_plans`,
    }
  }

  static bindAction(elementId, actionTask, eventName = 'click') {
    const actionElement = document.getElementById(elementId)
    if (!actionElement) throw new Error(`bindAction found no element with the id ${elementId}`)
    const pageElement = actionElement.closest(MeowApp.#pageSelector)
    actionElement.addEventListener(eventName, async actionEvent => {
      MeowApp.#showLoading(actionElement, true)
      try {
        await actionTask.call(pageElement, actionEvent)
      } catch (actionError) {
        console.error(actionError)
        shopify.toast.show(MeowApp.#errorHeading, { isError: true })
      } finally {
        MeowApp.#showLoading(actionElement, false)
      }
    })
  }

  static async #startSession() {
    const firebaseConfig = await MeowApp.#fetchJson(MeowApp.#configUrl)
    const firebaseAuth = getAuth(initializeApp(firebaseConfig))
    if (firebaseConfig.projectId.startsWith(MeowApp.#emulatorPrefix)) {
      connectAuthEmulator(firebaseAuth, location.origin, { disableWarnings: true })
    }
    const { customToken } = await MeowApp.#fetchJson(MeowApp.#authUrl, { headers: await MeowApp.#buildHeaders() })
    const { user: firebaseUser } = await signInWithCustomToken(firebaseAuth, customToken)
    const { claims: tokenClaims } = await firebaseUser.getIdTokenResult()
    return { shopId: tokenClaims.shopId, appDatabase: MeowApp.#connectDatabase(firebaseAuth) }
  }

  #readRoutes() {
    return [...this.querySelectorAll('meow-route')].map(routeElement => ({
      routeParts: MeowApp.#splitPath(routeElement.getAttribute('route-path')),
      pageTag: routeElement.getAttribute('page-tag'),
    }))
  }

  #followLink(clickEvent) {
    const linkPath = clickEvent.target.closest(MeowApp.#linkSelector)?.getAttribute('href')
    if (!linkPath || !this.#matchRoute(linkPath)) return
    clickEvent.preventDefault()
    history.pushState(null, '', linkPath)
    this.#showPage(linkPath)
  }

  static #escapeValue(htmlValue) {
    if (htmlValue instanceof SafeHtml) return htmlValue.htmlText
    if (Array.isArray(htmlValue)) return htmlValue.map(MeowApp.#escapeValue).join('')
    if (htmlValue === undefined || htmlValue === null || htmlValue === false) return ''
    return String(htmlValue).replace(MeowApp.#escapePattern, escapedCharacter => MeowApp.#htmlEscapes[escapedCharacter])
  }

  static #encodeBody(requestBody) {
    return requestBody === undefined || requestBody instanceof Blob ? requestBody : JSON.stringify(requestBody)
  }

  static #showLoading(actionElement, loadingFlag) {
    if (actionElement.closest(MeowApp.#saveSelector)) shopify.loading(loadingFlag)
    else actionElement.loading = loadingFlag
  }

  static #connectDatabase(firebaseAuth) {
    if (!firebaseAuth.emulatorConfig) return getFirestore(firebaseAuth.app)
    return initializeFirestore(firebaseAuth.app, {
      host: location.host,
      ssl: location.protocol === 'https:',
      experimentalForceLongPolling: true,
    })
  }

  #showPage(pagePath) {
    const routeMatch = this.#matchRoute(pagePath)
    if (!routeMatch) {
      this.replaceChildren()
      shopify.loading(false)
      return
    }
    const pageElement = document.createElement(routeMatch.pageTag)
    this.replaceChildren(pageElement)
    MeowApp.#startPage(pageElement, routeMatch.routeParams)
  }

  static async #fetchJson(requestUrl, requestOptions) {
    const fetchResponse = await fetch(requestUrl, requestOptions)
    const responseBody = await fetchResponse.json().catch(() => null)
    if (!fetchResponse.ok) {
      throw new Error(`${requestUrl} answered HTTP ${fetchResponse.status}: ${responseBody?.errorMessage ?? 'no reason given'}`)
    }
    return responseBody
  }

  static async #buildHeaders(requestBody) {
    const requestHeaders = { Authorization: `Bearer ${await shopify.idToken()}` }
    if (requestBody !== undefined) requestHeaders['Content-Type'] = requestBody instanceof Blob ? requestBody.type : 'application/json'
    return requestHeaders
  }

  static #splitPath(routePath) {
    return routePath.split('/').filter(Boolean)
  }

  #matchRoute(pagePath) {
    const pathParts = MeowApp.#splitPath(pagePath)
    for (const { routeParts, pageTag } of this.#pageRoutes) {
      const routeParams = MeowApp.#readParams(routeParts, pathParts)
      if (routeParams) return { pageTag, routeParams }
    }
    return null
  }

  static async #startPage(pageElement, routeParams) {
    shopify.loading(true)
    try {
      const [{ shopId }] = await Promise.all([MeowApp.#shopSession, customElements.whenDefined(pageElement.localName)])
      Object.assign(pageElement, { meowApp: MeowApp, shopId, routeParams })
      const pageData = await pageElement.loadData?.()
      if (pageElement.isConnected) pageElement.renderPage(pageData)
    } catch (pageError) {
      if (pageElement.isConnected) MeowApp.#showError(pageElement, pageError)
    } finally {
      if (pageElement.isConnected) shopify.loading(false)
    }
  }

  static #readParams(routeParts, pathParts) {
    if (routeParts.length !== pathParts.length) return null
    const routeParams = {}
    for (const [partIndex, routePart] of routeParts.entries()) {
      if (routePart.startsWith(MeowApp.#paramPrefix)) routeParams[routePart.slice(MeowApp.#paramPrefix.length)] = pathParts[partIndex]
      else if (routePart !== pathParts[partIndex]) return null
    }
    return routeParams
  }

  static #showError(pageElement, pageError) {
    pageElement.innerHTML = MeowApp.buildHtml`
      <s-page heading="${MeowApp.#errorHeading}">
        <s-banner tone="critical">${pageError.message}</s-banner>
      </s-page>
    `
  }
}
