class MeowGuide extends HTMLElement {
  static {
    customElements.define('meow-guide', MeowGuide)
  }

  renderPage() {
    const { buildHtml } = this.meowApp
    this.innerHTML = buildHtml`
      <s-page heading="Learn">
        <s-section heading="How this template works">
          <s-stack gap="base">
            <s-link href="/learn/pages">Pages — write one and route it</s-link>
            <s-link href="/learn/polaris">Polaris — build the UI</s-link>
            <s-link href="/learn/firestore">Firestore — store data</s-link>
          </s-stack>
        </s-section>

        <s-section heading="Run it locally">
          <s-stack gap="base">
            <s-paragraph>Emulators behind the Shopify tunnel.</s-paragraph>
            <s-paragraph><code>npm run dev</code></s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Ship it">
          <s-stack gap="base">
            <s-paragraph>1. Hosting, functions and rules.</s-paragraph>
            <s-paragraph><code>meowapps firebase deploy</code></s-paragraph>
            <s-paragraph>2. App config to Shopify.</s-paragraph>
            <s-paragraph><code>meowapps shopify app deploy</code></s-paragraph>
          </s-stack>
        </s-section>
      </s-page>
    `
  }
}
