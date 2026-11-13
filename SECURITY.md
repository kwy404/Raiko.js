# Security policy

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting on
[kwy404/Raiko.js](https://github.com/kwy404/Raiko.js/security/advisories/new) with the version,
a description of the impact and the smallest input that reproduces it.

You will get an answer within 72 hours. Confirmed issues are fixed in a patch release, credited
to the reporter if they want, and each fix ships with a test that reproduces the attack.

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | Yes |

## What was already audited

Before 1.0, two independent audits covered the router, body parsing, cookies, JSX escaping,
static files, the image endpoint, auth (OAuth, JWT, TOTP), the admin panel, CORS, CSRF, rate
limiting, caches, WebSocket framing and encryption, P2P signaling, the CLI and every generated
template. They found 21 issues; all are fixed and covered by `test/security/`.
