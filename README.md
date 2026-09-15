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
| Hosting  | AWS Elastic Beanstalk         |

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

## Deployment notes

Production runs `npm start` (`node app.js`), not nodemon — nodemon is a dev-only
dependency and is not installed in production. The app trusts the upstream proxy
so that generated links use the correct scheme when TLS is terminated by nginx
or Cloudflare.

## License

MIT — see [LICENSE](LICENSE).
