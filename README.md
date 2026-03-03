# Least Sum

## Environment Setup (Required)

This app reads Firebase config from Vite environment variables so values are not committed to GitHub.

1. Copy `.env.example` to `.env.local`.
2. Fill in your real Firebase values.

```bash
cp .env.example .env.local
```

Variables used by the app:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## Local Development

```bash
npm install
npm run dev
```

## GitHub Pages Deploy

This project deploys via:

```bash
npm run deploy
```

Deployment uses your local build environment, so make sure `.env.local` is present before running deploy.

## LiveKit Token Backend (Vercel, Backend-Only)

This repo now includes a Vercel serverless endpoint:

- `POST /api/get-token`
- file: `api/get-token.js`

### Request Body

```json
{
  "roomName": "ABCD",
  "participantName": "Rohith",
  "participantId": "p_1234"
}
```

`participantId` is optional. If present, identity is `${roomName}:${participantId}`; otherwise `${roomName}:${participantName}`.

### Response Body

```json
{
  "token": "<jwt>",
  "url": "wss://your-livekit-host",
  "expiresIn": 900
}
```

### Required Server Environment Variables (Vercel)

- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_URL`
- `ALLOWED_ORIGINS` (comma-separated; optional but recommended)
- `LIVEKIT_TOKEN_TTL_SECONDS` (optional, default `900`)

### Vercel Deploy Steps

1. Import this repo into Vercel.
2. Add the server env vars above in Project Settings.
3. Deploy.
4. Use endpoint:
   - `https://<your-vercel-domain>/api/get-token`

### Local Backend Test (Optional)

```bash
npm run voice:server
```

Local endpoint:

- `http://localhost:3001/get-token`

### Smoke Tests

Successful token:

```bash
curl -X POST https://<your-vercel-domain>/api/get-token \
  -H "Content-Type: application/json" \
  -d '{"roomName":"ABCD","participantName":"Rohith","participantId":"p_1"}'
```

Missing `roomName` (expect 400):

```bash
curl -X POST https://<your-vercel-domain>/api/get-token \
  -H "Content-Type: application/json" \
  -d '{"participantName":"Rohith"}'
```

Wrong method (expect 405):

```bash
curl -X GET https://<your-vercel-domain>/api/get-token
```
