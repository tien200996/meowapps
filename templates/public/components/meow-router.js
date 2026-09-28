import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  connectAuthEmulator,
  signInWithCustomToken,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

class MeowRouter extends HTMLElement {
  #routes;
  #auth;
  #db;

  async connectedCallback() {
    this.#routes = this.#readRoutes();
    this.#auth = await this.#signIn();
    this.#db = this.#connectDb();
    this.#listen();
    this.#render();
  }

  #readRoutes() {
    return [...this.querySelectorAll("meow-route")].map((el) => ({
      parts: this.#split(el.getAttribute("path")),
      tag: el.getAttribute("tag"),
    }));
  }

  async #signIn() {
    const config = await (await fetch("/api/public/config")).json();

    const auth = getAuth(initializeApp(config.firebase));
    if (config.authEmulator) {
      connectAuthEmulator(auth, location.origin, { disableWarnings: true });
    }

    const idToken = await shopify.idToken();
    const { token } = await (
      await fetch("/api/auth", { headers: { Authorization: `Bearer ${idToken}` } })
    ).json();

    await signInWithCustomToken(auth, token);
    return auth;
  }

  #connectDb() {
    const { app, emulatorConfig } = this.#auth;
    if (!emulatorConfig) return getFirestore(app);

    return initializeFirestore(app, {
      host: location.host,
      ssl: location.protocol === "https:",
      experimentalForceLongPolling: true,
    });
  }

  #listen() {
    addEventListener("popstate", () => this.#render());

    this.addEventListener("click", (e) => {
      const href = e.target.closest("[href^='/']")?.getAttribute("href");
      if (!href || !this.#resolve(href)) return;

      e.preventDefault();
      history.pushState(null, "", href);
      this.#render(href);
    });
  }

  #render(pathname = location.pathname) {
    const match = this.#resolve(pathname);
    this.replaceChildren(...(match ? [this.#page(match)] : []));
  }

  #resolve(pathname) {
    const path = this.#split(pathname);

    for (const route of this.#routes) {
      const match = this.#match(route, path);
      if (match) return match;
    }

    return null;
  }

  #match({ parts, tag }, path) {
    if (parts.length !== path.length) return null;

    const params = {};
    for (const [i, part] of parts.entries()) {
      if (part[0] === ":") params[part.slice(1)] = path[i];
      else if (part !== path[i]) return null;
    }

    return { tag, params };
  }

  #page({ tag, params }) {
    const page = document.createElement(tag);
    page.params = params;
    page.auth = this.#auth;
    page.db = this.#db;
    return page;
  }

  #split(path) {
    return path.split("/").filter(Boolean);
  }
}

customElements.define("meow-router", MeowRouter);
