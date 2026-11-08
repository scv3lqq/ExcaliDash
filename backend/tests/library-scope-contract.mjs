import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Run only against a disposable backend: fixture creation uses the public APIs.
const baseUrl = process.env.LIBRARY_CONTRACT_URL || "http://127.0.0.1:8000";
const password = `Synthetic-${randomUUID()}-Aa1!`;
const defaultScopes = [
  "drawings:read", "drawings:write", "collections:read", "collections:write",
];

function session(token) {
  const cookies = new Map();
  let csrf;
  return {
    async request(method, path, body) {
      const headers = {};
      if (token) headers.authorization = `Bearer ${token}`;
      if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
      if (csrf) headers[csrf.header] = csrf.token;
      if (body !== undefined) headers["content-type"] = "application/json";
      const response = await fetch(new URL(path, baseUrl), {
        method, headers, redirect: "error", signal: AbortSignal.timeout(15000),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const [name, ...value] = cookie.split(";")[0].split("=");
        cookies.set(name, value.join("="));
      }
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { data = undefined; }
      return { status: response.status, data, text };
    },
    async csrf() {
      const response = await this.request("GET", "/csrf-token");
      expectStatus(response, 200, "CSRF token");
      csrf = response.data;
    },
  };
}

function expectStatus(response, status, label) {
  // Never include response bodies: login/key responses contain credentials.
  assert.equal(response.status, status, `${label}: expected ${status}, received ${response.status}`);
}

async function createKey(owner, name, scopes) {
  const response = await owner.request("POST", "/auth/api-keys", { name, ...(scopes ? { scopes } : {}) });
  expectStatus(response, 201, `issue ${name}`);
  assert.equal(typeof response.data.token, "string");
  return { client: session(response.data.token), scopes: response.data.apiKey.scopes };
}

const admin = session();
await admin.csrf();
if (process.argv.includes("--onboard")) {
  const result = await admin.request("POST", "/auth/onboarding-choice", { enableAuth: true });
  assert.ok([200, 409].includes(result.status), "enable fixture authentication");
  console.log("Fixture authentication enabled");
  process.exit(0);
}

const adminEmail = `admin-${randomUUID()}@example.invalid`;
expectStatus(await admin.request("POST", "/auth/register", {
  email: adminEmail, name: "Synthetic admin", password,
  setupCode: process.env.SYNTHETIC_SETUP_CODE,
}), 201, "bootstrap synthetic admin");
expectStatus(await admin.request("POST", "/auth/login", { email: adminEmail, password }), 200, "admin login");
for (const name of ["owner", "other"]) {
  expectStatus(await admin.request("POST", "/auth/users", {
    email: `${name}@example.invalid`, name: `Synthetic ${name}`, password,
    role: "USER", mustResetPassword: false,
  }), 201, `create ${name}`);
}
async function login(name) {
  const client = session();
  await client.csrf();
  expectStatus(await client.request("POST", "/auth/login", { email: `${name}@example.invalid`, password }), 200, `${name} login`);
  return client;
}
const owner = await login("owner");
const other = await login("other");
const defaults = await createKey(owner, "default scopes");
assert.deepEqual(defaults.scopes, defaultScopes, "default scopes remain exactly four");
expectStatus(await defaults.client.request("GET", "/library"), 403, "defaults cannot read library");
const drawings = await createKey(owner, "drawings only", ["drawings:read"]);
expectStatus(await drawings.client.request("GET", "/library"), 403, "drawings scope cannot read library");

// This is the intentional first failure against the unpatched official image.
const library = await createKey(owner, "library only", ["library:read"]);
assert.deepEqual(library.scopes, ["library:read"]);
const combined = await createKey(owner, "all allowed scopes", [...defaultScopes, "library:read"]);
assert.deepEqual(combined.scopes, [...defaultScopes, "library:read"]);
const otherLibrary = await createKey(other, "other library", ["library:read"]);
assert.deepEqual((await otherLibrary.client.request("GET", "/library")).data, { items: [] }, "empty library");
const ownItems = [{ id: "synthetic-owner-item", elements: [], status: "unpublished", custom: { retained: true } }];
const otherItems = [{ id: "synthetic-other-item", elements: [] }];
expectStatus(await owner.request("PUT", "/library", { items: ownItems }), 200, "seed owner library");
expectStatus(await other.request("PUT", "/library", { items: otherItems }), 200, "seed other library");
for (const path of ["/library", "/library?fixture=1"]) {
  const response = await library.client.request("GET", path);
  expectStatus(response, 200, `library GET ${path}`);
  assert.deepEqual(response.data, { items: ownItems }, "owner library only");
}
const head = await library.client.request("HEAD", "/library");
expectStatus(head, 200, "library HEAD");
assert.equal(head.text, "");
assert.deepEqual((await otherLibrary.client.request("GET", "/library")).data, { items: otherItems }, "other owner isolated");
expectStatus(await session().request("GET", "/library"), 401, "anonymous library read");
expectStatus(await library.client.request("GET", "/library/"), 403, "only exact normalized library path");

// Unregistered methods/subpaths return 404; registered writes must fail authorization.
for (const client of [library.client, combined.client, defaults.client, drawings.client]) {
  expectStatus(await client.request("PUT", "/library", { items: [] }), 403, "API key library PUT denied");
  for (const method of ["POST", "PATCH", "DELETE"]) {
    expectStatus(await client.request(method, "/library", { items: [] }), 404, `library ${method} has no route`);
  }
  for (const method of ["GET", "HEAD", "PUT", "POST", "PATCH", "DELETE"]) {
    expectStatus(await client.request(method, "/library/synthetic-item", ["GET", "HEAD"].includes(method) ? undefined : { items: [] }), 404, `library subpath ${method} denied`);
  }
}
for (const path of ["/drawings", "/collections", "/auth/users", "/auth/me", "/auth/api-keys"]) {
  expectStatus(await library.client.request("GET", path), 403, `library-only key denied ${path}`);
}
expectStatus(await library.client.request("POST", "/auth/api-keys", { name: "denied" }), 403, "library key cannot issue keys");
assert.deepEqual((await library.client.request("GET", "/library")).data, { items: ownItems }, "denied writes preserve library");

const collection = await defaults.client.request("POST", "/collections", { name: "Synthetic collection" });
expectStatus(collection, 200, "default collection create");
expectStatus(await defaults.client.request("GET", "/collections"), 200, "default collection list");
expectStatus(await defaults.client.request("PUT", `/collections/${collection.data.id}`, { name: "Renamed fixture" }), 200, "default collection update");
const drawing = await defaults.client.request("POST", "/drawings", {
  name: "Synthetic drawing", elements: [], appState: {}, collectionId: collection.data.id,
});
expectStatus(drawing, 200, "default drawing create");
expectStatus(await defaults.client.request("GET", "/drawings"), 200, "default drawing list");
const readDrawing = await defaults.client.request("GET", `/drawings/${drawing.data.id}`);
expectStatus(readDrawing, 200, "default drawing read");
expectStatus(await library.client.request("GET", `/drawings/${drawing.data.id}`), 401, "library key cannot authenticate a drawing read");
expectStatus(await defaults.client.request("PUT", `/drawings/${drawing.data.id}`, {
  elements: [], version: readDrawing.data.version,
}), 200, "default drawing update");
expectStatus(await drawings.client.request("GET", `/drawings/${drawing.data.id}`), 200, "drawings-only key still reads drawing");
expectStatus(await defaults.client.request("DELETE", `/drawings/${drawing.data.id}`), 200, "default drawing delete");
expectStatus(await defaults.client.request("DELETE", `/collections/${collection.data.id}`), 200, "default collection delete");
console.log("PASS: library scope issuance, defaults, owner isolation, exact read routes, denied writes/auth, unchanged drawing/collection CRUD");
