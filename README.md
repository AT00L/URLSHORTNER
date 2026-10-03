# URL Shortener

A URL shortener with user accounts, built with Node.js, Express 5 and MongoDB.
Each user signs up, verifies their email with a one-time code, and manages their
own set of short links with click counts and QR codes.

**Live at [url.atulcode.com](https://url.atulcode.com)**

## Features

- Three-step signup — email first, one-time code to confirm it, then a password
- Verified accounts only: an unverified email cannot sign in
- JWT session in an httpOnly, SameSite cookie
- Per-user link list — you only ever see and manage your own URLs
- Click counter incremented atomically on every redirect
- Downloadable QR code (PNG or SVG) for any link
- Delete links, with ownership enforced in the query itself
- Server-rendered HTML with escaped output, light and dark themes

## Tech stack

| Layer    | Choice                        |
| -------- | ----------------------------- |
| Runtime  | Node.js (ES modules)          |
| Server   | Express 5                     |
| Database | MongoDB via Mongoose          |
| Auth     | jsonwebtoken + cookie-parser  |
| Email    | Resend                        |
| IDs      | shortid                       |
| QR       | qrcode                        |
| Hosting  | Vercel (serverless functions) |

## Routes

| Method | Path                 | Purpose                                  |
| ------ | -------------------- | ---------------------------------------- |
| GET    | `/`                  | Redirects to `/login`                    |
| GET    | `/signup`            | Step 1 — name and email                  |
| POST   | `/signup`            | Create the pending account, email a code |
| GET    | `/verify`            | Step 2 — enter the code                  |
| POST   | `/verify`            | Check the code, confirm the email        |
| POST   | `/verify/resend`     | Send a fresh code                        |
| GET    | `/set-password`      | Step 3 — choose a password               |
| POST   | `/set-password`      | Finish the account and start the session |
| GET    | `/login`             | Login form                               |
| POST   | `/login`             | Start a session                          |
| POST   | `/logout`            | Clear the session cookie                 |
| GET    | `/shorten`           | Dashboard — create and list links        |
| POST   | `/shorten`           | Create a short link                      |
| GET    | `/urls/:id/qr`       | QR code page for one link                |
| POST   | `/urls/:id/delete`   | Delete one link                          |
| GET    | `/robots.txt`        | Crawl rules, points at the sitemap       |
| GET    | `/sitemap.xml`       | Sitemap of the public pages              |
| GET    | `/:shortId`          | Resolve and redirect, counting the click |

## Signup flow

```
/signup          name + email          →  code emailed, pending cookie issued
/verify          6-digit code          →  email confirmed
/set-password    password + confirm    →  account complete, session issued
```

Codes are six digits, stored only as a SHA-256 hash, valid for 10 minutes, and
locked out after five wrong attempts. The session cookie is not issued until the
final step, so a half-finished signup never yields a login.

Signing up again with an email whose signup was never completed overwrites that
pending record. A completed account is never overwritten.

## Running locally

```bash
git clone https://github.com/AT00L/URLSHORTNER.git
cd URLSHORTNER
npm install
cp .env.example .env    # then edit the values
npm run dev
```

Then open http://localhost:8000

### Environment variables

| Variable          | Description                                           |
| ----------------- | ----------------------------------------------------- |
| `PORT`            | Port to listen on. Defaults to `8000`.                |
| `MONGODB_URI`     | MongoDB connection string.                            |
| `JWT_PRIVATE_KEY` | Secret used to sign session and pending tokens.       |
| `RESEND_API_KEY`  | Resend API key used to send one-time codes.           |
| `MAIL_FROM`       | Sender address on a domain verified in Resend.        |

`.env` is gitignored — never commit real credentials.

Sending requires a domain verified at [resend.com/domains](https://resend.com/domains);
until then Resend only delivers to the account owner's own address. `MAIL_FROM`
must use that verified domain. [`check-dns.sh`](check-dns.sh) reports whether the
required DNS records are live.

## Project layout

| Path                | Role                                                  |
| ------------------- | ----------------------------------------------------- |
| `app.js`            | Builds and exports the Express app. No `listen` call.  |
| `server.js`         | Local entry point — connects to Mongo, then listens.   |
| `api/index.js`      | Vercel entry point — the exported serverless handler.  |
| `config/db.js`      | Cached MongoDB connection.                             |
| `config/mailer.js`  | Resend client and the one-time-code email.             |
| `middlewares/auth.js` | Session check and signed-in redirect.                |
| `models/`           | Mongoose schemas for users and URLs.                   |
| `utils/otp.js`      | Code generation, hashing and comparison.               |
| `views/`            | HTML templates read by the renderer (not a static dir).|
| `vercel.json`       | Routes every request to the function; bundles `views/`.|

> `middlewares/`, not `middleware.js` — Vercel reserves a root `middleware.js`
> as Edge Middleware and will fail every request if the app uses that name.

## Deploying to Vercel

1. Push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new).
   No build command or output directory is needed.
2. Provision a **MongoDB Atlas** cluster. A `localhost` connection string cannot
   work from Vercel — the function has no local database beside it. In Atlas,
   allow access from anywhere (`0.0.0.0/0`), since Vercel functions do not have
   fixed outbound IPs.
3. Add `MONGODB_URI`, `JWT_PRIVATE_KEY`, `RESEND_API_KEY` and `MAIL_FROM` under
   *Settings → Environment Variables*. `PORT` is unused on Vercel.
4. Deploy. Every request is rewritten to `api/index.js`, which awaits a cached
   MongoDB connection and then hands the request to Express.

The connection is cached on `globalThis`, so a warm container reuses one
connection across invocations instead of opening a new one per request. A failed
connection clears the cache so the next request retries.

Local development is unchanged: `npm run dev` runs `server.js` under nodemon,
which opens a normal long-lived HTTP server on `PORT`.

## License

MIT — see [LICENSE](LICENSE).
