class MeowNote extends HTMLElement {
  static {
    customElements.define('meow-note', MeowNote)
  }

  connectedCallback() {
    this.#renderNote()
  }

  #renderNote() {
    const noteParagraph = document.createElement('s-paragraph')
    const docCode = document.createElement('code')
    docCode.textContent = this.getAttribute('doc-id')
    noteParagraph.append(`${this.getAttribute('note-text')} — `, docCode)
    this.replaceChildren(noteParagraph)
  }
}
