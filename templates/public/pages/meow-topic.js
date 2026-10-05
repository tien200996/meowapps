class MeowTopic extends HTMLElement {
  static #notesPath = 'integrations/learn/notes'
  static #noteCount = 20

  static {
    customElements.define('meow-topic', MeowTopic)
  }

  async loadData() {
    if (this.routeParams.topicName !== 'firestore') return {}
    return { savedNotes: await this.meowApp.listDocs(MeowTopic.#notesPath, { newestCount: MeowTopic.#noteCount }) }
  }

  renderPage({ savedNotes }) {
    const { topicName } = this.routeParams
    if (topicName === 'pages') this.#renderPages()
    else if (topicName === 'polaris') this.#renderPolaris()
    else if (topicName === 'firestore') this.#renderFirestore(savedNotes)
    else this.#renderMissing()
  }

  #renderPages() {
    const { buildHtml } = this.meowApp
    this.innerHTML = buildHtml`
      <s-page heading="Pages">
        <s-link slot="breadcrumb-actions" href="/learn">Learn</s-link>

        <s-section heading="You are looking at one right now">
          <s-stack gap="base">
            <s-paragraph>This page is <code>pages/meow-topic.js</code></s-paragraph>
            <s-paragraph>It matched the route <code>/learn/:topicName</code></s-paragraph>
            <s-paragraph><code>meow-app.js</code> set <code>this.routeParams.topicName</code> to <code>${this.routeParams.topicName}</code></s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Declare it in index.html">
          <s-stack gap="base">
            <s-paragraph>Nothing else wires a page up.</s-paragraph>
            <s-paragraph>1. Route it.</s-paragraph>
            <s-paragraph><code>&lt;meow-route route-path="/learn/:topicName" page-tag="meow-topic"&gt;</code></s-paragraph>
            <s-paragraph>2. Load it.</s-paragraph>
            <s-paragraph><code>&lt;script type="module" src="/pages/meow-topic.js"&gt;</code></s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="What meow-app.js runs">
          <s-stack gap="base">
            <s-paragraph>1. <code>loadData()</code>, if the page has it, while the admin shows its loading bar.</s-paragraph>
            <s-paragraph>2. <code>renderPage(pageData)</code>, with what <code>loadData()</code> returned.</s-paragraph>
            <s-paragraph>If either throws, the page shows the error under the <code>error-heading</code> of <code>&lt;meow-app&gt;</code>.</s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="What this.meowApp holds">
          <s-stack gap="base">
            <s-paragraph><code>buildHtml</code> — HTML that escapes every value in it</s-paragraph>
            <s-paragraph><code>readDoc</code>, <code>listDocs</code>, <code>writeDoc</code> — Firestore under <code>shops/{shopId}/</code></s-paragraph>
            <s-paragraph><code>callApi</code> — your backend, with the session token</s-paragraph>
            <s-paragraph><code>queryAdmin</code> — the Shopify Admin API, through App Bridge</s-paragraph>
            <s-paragraph><code>readPlan</code> — the store's plan and the URL of its plan page</s-paragraph>
            <s-paragraph><code>bindAction</code> — a method run on click, or on the event you name, with loading and an error toast</s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Pages, components and services">
          <s-stack gap="base">
            <s-paragraph>A page sits in <code>pages/</code>, owns the data and imports only services.</s-paragraph>
            <s-paragraph>A component sits in <code>components/</code>, imports nothing and shows what its attributes hold, like <code>components/meow-note.js</code> on the Firestore page.</s-paragraph>
            <s-paragraph>A service sits in <code>services/</code> and holds the logic that pages share.</s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Read next">
          <s-stack gap="base">
            <s-link href="https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements" target="_blank">MDN — Using custom elements</s-link>
            <s-link href="https://developer.mozilla.org/en-US/docs/Web/API/History_API" target="_blank">MDN — History API, what meow-app.js uses</s-link>
          </s-stack>
        </s-section>
      </s-page>
    `
  }

  #renderPolaris() {
    const { buildHtml } = this.meowApp
    this.innerHTML = buildHtml`
      <s-page heading="Polaris">
        <s-link slot="breadcrumb-actions" href="/learn">Learn</s-link>

        <s-section heading="Every s-* element comes from Polaris">
          <s-stack gap="base">
            <s-paragraph>Polaris loads before App Bridge in <code>index.html</code></s-paragraph>
            <s-paragraph>That order registers the <code>s-*</code> elements first.</s-paragraph>
            <s-paragraph>Don't guess the markup. Look a component up:</s-paragraph>
            <s-paragraph><code>npx meowapps shopify doc search --query "s-stack"</code></s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Read next">
          <s-stack gap="base">
            <s-link href="https://shopify.dev/docs/api/app-home/latest/web-components" target="_blank">All App Home web components</s-link>
          </s-stack>
        </s-section>
      </s-page>
    `
  }

  #renderFirestore(savedNotes) {
    const { buildHtml, bindAction } = this.meowApp
    const noteList = savedNotes.length
      ? savedNotes.map(savedNote => buildHtml`<meow-note note-text="${savedNote.noteText}" doc-id="${savedNote.docId}"></meow-note>`)
      : buildHtml`<s-paragraph>No notes yet. Write one above.</s-paragraph>`
    this.innerHTML = buildHtml`
      <s-page heading="Firestore">
        <s-link slot="breadcrumb-actions" href="/learn">Learn</s-link>

        <s-section heading="Scoped to your shop">
          <s-stack gap="base">
            <s-paragraph>Your notes live at <code>shops/${this.shopId}/${MeowTopic.#notesPath}</code></s-paragraph>
            <s-paragraph>Rules in <code>firestore.rules</code> allow <code>shops/{shopId}</code> only.</s-paragraph>
            <s-paragraph>The token must carry a matching <code>shopId</code> claim.</s-paragraph>
            <s-paragraph>Another shop cannot read this, even with the same code.</s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Write one">
          <s-stack direction="inline" gap="base">
            <s-text-field id="note-field" label="Note"></s-text-field>
            <s-button id="note-button">Add note</s-button>
          </s-stack>
        </s-section>

        <s-section heading="Read them back">
          <s-stack gap="base">${noteList}</s-stack>
        </s-section>

        <s-section heading="Read next">
          <s-stack gap="base">
            <s-link href="https://firebase.google.com/docs/firestore/data-model" target="_blank">Firestore data model</s-link>
            <s-link href="https://firebase.google.com/docs/firestore/security/get-started" target="_blank">Security rules</s-link>
          </s-stack>
        </s-section>
      </s-page>
    `
    bindAction('note-button', this.#addNote)
  }

  #renderMissing() {
    const { buildHtml } = this.meowApp
    this.innerHTML = buildHtml`
      <s-page heading="Not found">
        <s-link slot="breadcrumb-actions" href="/learn">Learn</s-link>

        <s-section>
          <s-paragraph>There is no topic called <code>${this.routeParams.topicName}</code></s-paragraph>
        </s-section>
      </s-page>
    `
  }

  async #addNote() {
    const noteText = this.querySelector('#note-field').value
    if (!noteText) return
    await this.meowApp.writeDoc(`${MeowTopic.#notesPath}/${crypto.randomUUID()}`, { noteText, saveTime: Date.now() })
    this.renderPage(await this.loadData())
  }
}
