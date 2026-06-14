// Minimal fetch wrapper for the DMTool API e2e harness.
// Node 22 global fetch; no dependencies. Every call returns { status, ok, body }
// (body parsed as JSON when possible, else raw text, else null).

export class ApiClient {
  constructor(base) {
    this.base = (base || process.env.BASE || "http://localhost:3501").replace(/\/+$/, "");
    this.token = null;
    this.username = null;
    this.userId = null;
  }

  setToken(t) {
    this.token = t;
  }

  async request(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    if (this.token) headers["Authorization"] = "Bearer " + this.token;
    const res = await fetch(this.base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { status: res.status, ok: res.ok, body: parsed };
  }

  get(p) {
    return this.request("GET", p);
  }
  post(p, b) {
    return this.request("POST", p, b ?? {});
  }
  put(p, b) {
    return this.request("PUT", p, b ?? {});
  }
  patch(p, b) {
    return this.request("PATCH", p, b ?? {});
  }
  del(p) {
    return this.request("DELETE", p);
  }
}
