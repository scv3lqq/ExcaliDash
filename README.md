# ExcaliDash: Library read scope

This [fork](https://github.com/scv3lqq/ExcaliDash) keeps stable ExcaliDash **0.6.7**
and adds an explicit, read-only `library:read` account API key scope for
[ExcaliDash MCP](https://github.com/scv3lqq/excalidash-mcp). It preserves the
upstream frontend, authentication, owner isolation, database schema, and runtime
dependencies. The image label reports `0.6.7+library-read`. The maintained delivery branch is
`feat/excalidash-library`; upstream history is preserved.

## Scope of this patch

- `library:read` permits only exact `/library` GET and HEAD requests.
- Default API key scopes remain exactly `drawings:read`, `drawings:write`,
  `collections:read`, and `collections:write`. Existing keys gain no permissions.
- API keys cannot write the Library or access Library subpaths. A library-only key
  cannot access drawings, collections, account settings, or administration.
- The existing Library route reads only the authenticated key owner's saved items.
  An owner with no Library receives `{ "items": [] }`.

The TypeScript patch touches only `backend/src/auth/apiKeys.ts`,
`backend/src/auth/accountApiKeyRoutes.ts`, and `backend/src/middleware/auth.ts`.
`Dockerfile.library` compiles the complete backend against the official image's
SQLite Prisma client, then copies only the three corresponding JavaScript files
onto the immutable official 0.6.7 runtime. Their owner is `1001:1001`, mode `0444`.
There are no migrations or runtime dependency updates in this patch.

## Build and verify

Requirements: Docker with Linux image support, Make, Git, and Node.js 24.22.1 or
later for the local script syntax checks. Run from the repository root:

```sh
make check
```

This builds `excalidash-backend:library-check` using the digest-pinned official
runtime and compiler, runs full TypeScript compilation, and exercises real HTTP
requests against an isolated backend. The contract provisions synthetic accounts
through normal onboarding, login, CSRF, and API key management APIs. It publishes
no ports and attaches no existing database or application volumes. Container and
network cleanup failures fail the check.

Build or test separately:

```sh
make image PATCH_IMAGE=excalidash-backend:library-local
sh backend/tests/run-library-contract.sh excalidash-backend:library-local
```

`PATCH_REVISION` defaults to `git rev-parse HEAD`. Supply the exact source commit
when producing a release image. `Dockerfile.library` records fork source,
upstream source, base digest, version, and patch revision in OCI labels.
The contract's optional second argument selects a private log directory; otherwise
it creates one under the system temporary directory. Setup codes are redacted.

## Configure a dedicated MCP key

Use a dedicated account API key with only the required permissions. Library
browsing needs `library:read`; inserting into drawings also needs `drawings:read`
and `drawings:write`. Collection permissions are unnecessary for MCP.

Issue the key through authenticated `POST /auth/api-keys` with the usual session
and CSRF protection. For example, the JSON request body is:

```json
{
  "name": "Library MCP",
  "scopes": ["drawings:read", "drawings:write", "library:read"]
}
```

The unchanged 0.6.7 frontend may not display the new scope as a checkbox. Store the
one-time key response securely; never put it in source, issue reports, or images.
A `403` from an old key means a newly issued key needs the explicit scope.

Application environment and volumes follow the
[upstream configuration reference](https://excalidash.xyz/reference/environment).
A generic local environment example is:

```dotenv
AUTH_MODE=local
DATABASE_PROVIDER=sqlite
DATABASE_URL=file:/app/prisma/dev.db
FRONTEND_URL=https://draw.example.invalid
```

| Setting                     | Purpose                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `AUTH_MODE=local`           | Existing local authentication, including normal onboarding |
| `DATABASE_PROVIDER=sqlite`  | Provider used by this minimal patch build                  |
| `DATABASE_URL`              | Existing persistent application database location          |
| `FRONTEND_URL`              | Your frontend origin, used by existing origin checks       |
| `JWT_SECRET`, `CSRF_SECRET` | Preserve existing values or their persisted secret files   |
| `API_KEY_HASH_PEPPER`       | Preserve the existing value so issued keys remain valid    |

`.env` files are ignored. Runtime credentials and deployment configuration belong
outside the public source repository.

## Deployment and rollback

Back up the database, uploads, and persisted secrets before replacing a backend.
Use your existing deployment configuration and volumes with the locally built
patched backend; keep the official frontend at 0.6.7. Record the source commit and
image digest alongside the backup. This repository contains buildable source,
not a production deployment inventory.

Rollback selects the original official 0.6.7 backend image while retaining the
same database, uploads, and secrets. The patch introduces no schema migration.
Library MCP calls then receive `403`; ordinary default-scope keys retain their
original permissions. Keep the previous MCP configuration and key available for
an operational rollback.

See [SECURITY.md](SECURITY.md) for private vulnerability reporting and the
[upstream project](https://github.com/ZimengXiong/ExcaliDash) for the original
license, documentation, and full application development workflow. New fork CI
builds the narrow patch and scans full Git history. Existing upstream test jobs
remain; upstream publication and release jobs run only in the upstream repository.

## Upstream project

Self-hosted Excalidraw workspaces with collections, real-time collaboration,
sharing, history, backups, and local or OpenID Connect authentication.

[![ExcaliDash dashboard](docs/public/images/workspace.png)](https://excalidash.xyz)

[Self-host Excalidraw with Docker Compose](https://excalidash.xyz/deploy/docker),
or read the documentation at [excalidash.xyz](https://excalidash.xyz).

## Quick start

```sh
git clone https://github.com/ZimengXiong/ExcaliDash.git
cd ExcaliDash
docker compose -f docker-compose.prod.yml up -d
```

Open <http://localhost:6767>. Configuration and deployment guidance live in
the [documentation](https://excalidash.xyz).

ExcaliDash is licensed under the GNU Lesser General Public License v3.0.
