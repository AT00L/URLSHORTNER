# URL Shortener

A URL shortener with user accounts, built with Node.js, Express 5 and MongoDB.
Each user signs up, logs in, and manages their own set of short links with click
counts. Live at **https://urlshortneratul.is-a.dev**

## Features

- Email/password signup and login, with passwords never stored in plain text
- JWT session held in an httpOnly cookie
- Per-user link list — you only ever see and manage your own URLs
- Click counter incremented on every redirect
- Server-rendered HTML pages with escaped output

## Tech stack

| Layer    | Choice                        |
| -------- | ----------------------------- |
| Runtime  | Node.js (ES modules)          |
| Server   | Express 5                     |
| Database | MongoDB via Mongoose          |
| Auth     | jsonwebtoken + cookie-parser  |
| IDs      | shortid                       |
| Hosting  | Vercel (serverless functions) |

## Routes

| Method | Path         | Purpose                              |
| ------ | ------------ | ------------------------------------ |
| GET    | `/`          | Redirects to the app entry point     |
| GET    | `/signup`    | Signup form                          |
| POST   | `/signup`    | Create an account                    |
| GET    | `/login`     | Login form                           |
| POST   | `/login`     | Start a session                      |
| POST   | `/logout`    | Clear the session cookie             |
| GET    | `/shorten`   | Dashboard — create and list links    |
| POST   | `/shorten`   | Create a short link                  |
| GET    | `/:shortId`  | Resolve and redirect, counting click |

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

| Variable          | Description                                  |
| ----------------- | -------------------------------------------- |
| `PORT`            | Port to listen on. Defaults to `8000`.       |
| `MONGODB_URI`     | MongoDB connection string.                   |
| `JWT_PRIVATE_KEY` | Secret used to sign session tokens.          |

`.env` is gitignored — never commit real credentials.

## Project layout

| File             | Role                                                      |
| ---------------- | --------------------------------------------------------- |
| `app.js`         | Builds and exports the Express app. No `listen` call.      |
| `server.js`      | Local entry point — connects to Mongo, then listens.       |
| `api/index.js`   | Vercel entry point — the exported serverless handler.      |
| `views/`         | HTML templates read by the renderer (not a static dir).    |
| `vercel.json`    | Routes every request to the function; bundles `views/`.    |

## Deploying to Vercel

1. Push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new).
   No build command or output directory is needed.
2. Provision a **MongoDB Atlas** cluster. A `localhost` connection string cannot
   work from Vercel — the function has no local database beside it. In Atlas,
   allow access from anywhere (`0.0.0.0/0`), since Vercel functions do not have
   fixed outbound IPs.
3. Add the environment variables under *Settings → Environment Variables*:

   | Variable          | Value                                      |
   | ----------------- | ------------------------------------------ |
   | `MONGODB_URI`     | The Atlas connection string, with a db name |
   | `JWT_PRIVATE_KEY` | A long random secret                        |

   `PORT` is not used on Vercel; the platform handles routing itself.
4. Deploy. Every request is rewritten to `api/index.js`, which awaits a cached
   MongoDB connection and then hands the request to Express.

The connection is cached on `globalThis`, so a warm container reuses one
connection across invocations instead of opening a new one per request. A failed
connection clears the cache so the next request retries.

Local development is unchanged: `npm run dev` runs `server.js` under nodemon,
which still opens a normal long-lived HTTP server on `PORT`.

## License

MIT — see [LICENSE](LICENSE).
