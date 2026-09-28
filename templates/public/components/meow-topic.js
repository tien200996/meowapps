import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

class MeowTopic extends HTMLElement {
  connectedCallback() {
    switch (this.params.topic) {
      case "pages":
        return (this.innerHTML = this.#pages());
      case "polaris":
        return (this.innerHTML = this.#polaris());
      case "firestore":
        return this.#firestore();
      default:
        return (this.innerHTML = this.#notFound());
    }
  }

  #pages() {
    return `
      <s-page heading="Pages">
        <s-link slot="breadcrumb-actions" href="/learn">Learn</s-link>

        <s-section heading="You are looking at one right now">
          <s-stack gap="base">
            <s-paragraph>This page is <code>components/meow-topic.js</code></s-paragraph>
            <s-paragraph>It matched the route <code>/learn/:topic</code></s-paragraph>
            <s-paragraph>The router set <code>this.params.topic</code> to <code>${this.params.topic}</code></s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Declare it in index.html">
          <s-stack gap="base">
            <s-paragraph>Nothing else wires a page up.</s-paragraph>
            <s-paragraph>1. Route it.</s-paragraph>
            <s-paragraph><code>&lt;meow-route path="/learn/:topic" tag="meow-topic"&gt;</code></s-paragraph>
            <s-paragraph>2. Load it.</s-paragraph>
            <s-paragraph><code>&lt;script src="/components/meow-topic.js"&gt;</code></s-paragraph>
            <s-paragraph>Segments starting with <code>:</code> land in <code>this.params</code></s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="What the router hands you">
          <s-stack gap="base">
            <s-paragraph><code>this.auth</code> — Firebase Auth, scoped to this shop</s-paragraph>
            <s-paragraph><code>this.db</code> — Firestore, same scope</s-paragraph>
            <s-paragraph><code>this.params</code> — values from the route</s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Read next">
          <s-stack gap="base">
            <s-link href="https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements" target="_blank">MDN — Using custom elements</s-link>
            <s-link href="https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API" target="_blank">MDN — Navigation API, what the router intercepts</s-link>
          </s-stack>
        </s-section>
      </s-page>
    `;
  }

  #polaris() {
    return `
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
    `;
  }

  #firestore() {
    const shopId = this.auth.currentUser.uid.split("_")[0];
    const path = `shops/${shopId}/notes`;

    this.innerHTML = `
      <s-page heading="Firestore">
        <s-link slot="breadcrumb-actions" href="/learn">Learn</s-link>

        <s-section heading="Scoped to your shop">
          <s-stack gap="base">
            <s-paragraph>Your data lives at <code>${path}</code></s-paragraph>
            <s-paragraph>Rules in <code>firestore.rules</code> allow <code>shops/{shopId}</code> only.</s-paragraph>
            <s-paragraph>The token must carry a matching <code>shopId</code> claim.</s-paragraph>
            <s-paragraph>Another shop cannot read this, even with the same code.</s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Write one">
          <s-stack direction="inline" gap="base">
            <s-text-field id="text" label="Note"></s-text-field>
            <s-button id="add">Add note</s-button>
          </s-stack>
        </s-section>

        <s-section heading="Read them back">
          <s-stack id="notes" gap="base"></s-stack>
        </s-section>

        <s-section heading="Read next">
          <s-stack gap="base">
            <s-link href="https://firebase.google.com/docs/firestore/data-model" target="_blank">Firestore data model</s-link>
            <s-link href="https://firebase.google.com/docs/firestore/security/get-started" target="_blank">Security rules</s-link>
          </s-stack>
        </s-section>
      </s-page>
    `;

    this.querySelector("#add").addEventListener("click", () => this.#add(path));
    this.#list(path);
  }

  #notFound() {
    return `
      <s-page heading="Not found">
        <s-link slot="breadcrumb-actions" href="/learn">Learn</s-link>

        <s-section>
          <s-paragraph>There is no topic called <code>${this.params.topic}</code></s-paragraph>
        </s-section>
      </s-page>
    `;
  }

  async #add(path) {
    const field = this.querySelector("#text");
    if (!field.value) return;

    const button = this.querySelector("#add");
    button.loading = true;

    try {
      await addDoc(collection(this.db, path), {
        text: field.value,
        at: serverTimestamp(),
      });
      field.value = "";
      await this.#list(path);
    } finally {
      button.loading = false;
    }
  }

  async #list(path) {
    const notes = this.querySelector("#notes");
    notes.innerHTML = `<s-paragraph>Loading…</s-paragraph>`;

    const snap = await getDocs(collection(this.db, path));

    notes.innerHTML = snap.empty
      ? `<s-paragraph>No notes yet. Write one above.</s-paragraph>`
      : snap.docs
          .map((d) => `<s-paragraph>${d.data().text} — <code>${d.id}</code></s-paragraph>`)
          .join("");
  }
}

customElements.define("meow-topic", MeowTopic);
