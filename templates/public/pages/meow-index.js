class MeowIndex extends HTMLElement {
  static {
    customElements.define('meow-index', MeowIndex)
  }

  renderPage() {
    const { buildHtml, bindAction } = this.meowApp
    this.innerHTML = buildHtml`
      <s-page heading="Your app is running">
        <s-section heading="Signed in as ${this.shopId}">
          <s-stack gap="base">
            <s-paragraph>1. Shopify issued a session token.</s-paragraph>
            <s-paragraph>2. The backend verified it and minted a Firebase token.</s-paragraph>
            <s-paragraph>3. <code>meow-app.js</code> signed in with it and gives every page <code>this.shopId</code></s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Add a page">
          <s-stack gap="base">
            <s-paragraph>You are reading <code>pages/meow-index.js</code></s-paragraph>
            <s-paragraph>1. Copy it to <code>pages/meow-orders.js</code></s-paragraph>
            <s-paragraph>2. Route it in <code>index.html</code></s-paragraph>
            <s-paragraph><code>&lt;meow-route route-path="/orders" page-tag="meow-orders"&gt;</code></s-paragraph>
            <s-paragraph>3. Load it in <code>index.html</code></s-paragraph>
            <s-paragraph><code>&lt;script type="module" src="/pages/meow-orders.js"&gt;</code></s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Call your backend">
          <s-stack gap="base">
            <s-paragraph>Endpoints live in <code>functions/app-routes.js</code>, and <code>functions/index.js</code> routes to them.</s-paragraph>
            <s-paragraph><code>this.meowApp.callApi</code> attaches the session token for you.</s-paragraph>
            <s-button id="hello-button">Call /api/hello</s-button>
            <s-paragraph id="hello-result"></s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Next">
          <s-link href="/learn">Learn how it works and how to ship it</s-link>
        </s-section>
      </s-page>
    `
    bindAction('hello-button', this.#callHello)
  }

  async #callHello() {
    const helloAnswer = await this.meowApp.callApi('/api/hello')
    this.querySelector('#hello-result').textContent = JSON.stringify(helloAnswer)
  }
}
