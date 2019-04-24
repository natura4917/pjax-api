import { URL, StandardURL } from '../../../../../../lib/url';
import { fix } from '../../../../../../lib/html';

export class FetchResponse {
  constructor(
    public readonly url: URL<StandardURL>,
    private readonly xhr: XMLHttpRequest,
  ) {
    assert(this.document instanceof Document);
    if (url.origin !== new URL(xhr.responseURL).origin) throw new Error(`Redirected to another origin.`);
    void Object.defineProperty(this.document, 'URL', {
      configurable: true,
      enumerable: true,
      value: url.href,
      writable: false,
    });
    void fix(this.document);
    assert(this.document.URL === url.href);
    void Object.freeze(this);
  }
  public readonly header: (name: string) => string | null =
    name => this.xhr.getResponseHeader(name);
  public readonly document: Document =
    this.xhr.responseXML!.cloneNode(true) as Document;
}
