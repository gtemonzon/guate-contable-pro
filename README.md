# Guate Contable Pro

A multi-tenant accounting platform for Guatemalan firms.

## Quick start

```sh
git clone <YOUR_GIT_URL>
cd <project>
cp .env.example .env          # fill in your public Supabase values
npm install
npm run dev
```

## Environment variables

| Variable | Purpose | Safe to commit? |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | ✅ Yes (public) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/public key | ✅ Yes (public) |
| `VITE_SUPABASE_PROJECT_ID` | Project reference | ✅ Yes |

> ⚠️ **Never** add `SUPABASE_SERVICE_ROLE_KEY` or any private key to `.env` or commit it to git.  
> Private keys belong only in Lovable Cloud Secrets (server-side only).

## Secrets Safety Checklist

- [ ] `.env` is listed in `.gitignore` — never committed
- [ ] Only the **anon (publishable)** key is used in client code
- [ ] `SERVICE_ROLE_KEY` lives only in Cloud Secrets, used only in Edge Functions
- [ ] If a key is ever accidentally committed: rotate it immediately (see `SECURITY.md §1.1`)
- [ ] Run `git rm --cached .env` to untrack if accidentally staged

## Pre-commit hooks (recommended)

Install Husky to block accidental secret commits locally:

```sh
npx husky install
chmod +x .husky/pre-commit
```

The hook will reject commits that contain `.env` files or common secret patterns.

## CI pipeline

Every push runs:
1. `tsc` — type check
2. `eslint` — lint
3. Secret scan (blocks `service_role`, `PRIVATE_KEY`, etc.)
4. `vite build` — production build

See `.github/workflows/ci.yml`.

## Tech stack

- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Lovable Cloud (Supabase under the hood) for auth, DB, Edge Functions

## Security

See `SECURITY.md` for the full security checklist, RLS patterns, and incident response guide.

## Contributing

See `CONTRIBUTING.md`.
