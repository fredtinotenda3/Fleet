# Credential rotation — required before production

Several credentials in this repository's history must be treated as
**compromised and rotated**. None of these are theoretical: each has been
exposed in a way that puts it outside your control.

## Rotate now

| Credential | Why | Where |
|---|---|---|
| **MongoDB Atlas user `Stanley`** | The full connection string, password included, was pasted into a chat transcript more than once. | Atlas → Database Access → Edit user → Edit Password. Then update `MONGODB_URI` in `.env` and in Vercel's environment variables. |
| `NEXTAUTH_SECRET` | Shipped in the original archive. Anyone with that archive can forge a session cookie. | Regenerate: `openssl rand -base64 32` |
| `JWT_SECRET` / access-token signing key | Same exposure. Forging an access token means impersonating any user, including `super_admin`. | Regenerate: `openssl rand -base64 32` |
| Any SMTP / storage / third-party API keys in `.env` | Shipped in the original archive. | Rotate at the provider. |

## Rotating the token secrets logs everyone out

That is expected and desirable — it invalidates every token minted under the
old key, including any an attacker may hold. Pair it with:

```
npm run db:purge-sentinels -- --confirm
```

which revokes the ~4,500 refresh tokens and sessions still carrying the legacy
`tenantId: "default"` sentinel. Those were issued before tenant binding was
enforced, so their tenant claim was never verified.

## Then verify

```
npm run tenancy:sync-members     # every account resolves to the right units
npm run test:security            # 190 tests
```

## Preventing recurrence

- `.env` must never be committed. Confirm it is in `.gitignore` and, if it was
  ever committed, purge it from git history — deleting the file in a later
  commit does not remove it from the history.
- Keep production values in Vercel's environment variables, not in a file.
- Give the application's Atlas user only `readWrite` on `VehicleExpense`. The
  current user appears to have broader rights than the app needs.
- Atlas IP access list: restrict to Vercel's egress ranges rather than
  `0.0.0.0/0`.
