class MeowIndex extends HTMLElement {
  connectedCallback() {
    const shopId = this.auth.currentUser.uid.split("_")[0];

    this.innerHTML = `
      <s-page heading="Your app is running">
        <s-section heading="Signed in as ${shopId}">
          <s-stack gap="base">
            <s-paragraph>1. Shopify issued a session token.</s-paragraph>
            <s-paragraph>2. The backend verified it and minted a Firebase token.</s-paragraph>
            <s-paragraph>3. Every page receives it as <code>this.auth</code></s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Add a page">
          <s-stack gap="base">
            <s-paragraph>You are reading <code>components/meow-index.js</code></s-paragraph>
            <s-paragraph>1. Copy it to <code>components/meow-foo.js</code></s-paragraph>
            <s-paragraph>2. Route it in <code>index.html</code></s-paragraph>
            <s-paragraph><code>&lt;meow-route path="/foo" tag="meow-foo"&gt;</code></s-paragraph>
            <s-paragraph>3. Load it in <code>index.html</code></s-paragraph>
            <s-paragraph><code>&lt;script src="/components/meow-foo.js"&gt;</code></s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Call your backend">
          <s-stack gap="base">
            <s-paragraph>Endpoints live in <code>functions/index.js</code></s-paragraph>
            <s-paragraph>The session token is attached for you.</s-paragraph>
            <s-button id="call">Call /api/hello</s-button>
            <s-paragraph id="result"></s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Next">
          <s-link href="/learn">Learn how it works and how to ship it</s-link>
        </s-section>
      </s-page>
    `;

    this.querySelector("#call").addEventListener("click", () => this.#call());
  }

  async #call() {
    const button = this.querySelector("#call");
    const result = this.querySelector("#result");

    button.loading = true;
    result.textContent = "";

    try {
      const res = await fetch("/api/hello", {
        headers: { Authorization: `Bearer ${await shopify.idToken()}` },
      });
      result.textContent = JSON.stringify(await res.json());
    } catch (e) {
      result.textContent = `Failed: ${e.message}`;
    } finally {
      button.loading = false;
    }
  }
}

customElements.define("meow-index", MeowIndex);
