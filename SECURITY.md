# Security

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/scv3lqq/ExcaliDash/security/advisories/new)
for this fork. Include the source commit or image digest, affected route, expected
and actual authorization behavior, and a minimal reproduction using synthetic
accounts. Do not include live API keys, session cookies, setup codes, database
files, private origins, or user artwork in public issues.

For vulnerabilities in unchanged upstream application code, use the
[upstream security page](https://github.com/ZimengXiong/ExcaliDash/security).

## Supported patch

This fork's Library patch targets stable ExcaliDash 0.6.7. It grants an explicit
`library:read` scope for exact `/library` GET/HEAD only. Defaults stay unchanged;
Library writes and account/admin routes remain unavailable to API keys. Existing
owner identity and CSRF behavior are retained. No authentication bypass,
database migration, or runtime dependency is added.

Use dedicated keys with the minimum required scopes and revoke leaked keys via
normal account management. Preserve JWT/CSRF secrets and the API key hash pepper
when recreating the backend. Use HTTPS and the existing authentication layer when
exposing the application. Store secret configuration outside this repository.

The patched image is derived from a digest-pinned official base. Audit that base
and monitor upstream advisories separately: a narrow authorization patch does not
replace upstream security maintenance. Rebuild from reviewed source, retain the
source commit and image digest, and verify the real HTTP contract before rollout.
