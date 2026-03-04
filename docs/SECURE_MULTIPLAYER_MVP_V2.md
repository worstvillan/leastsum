# Secure Multiplayer MVP v2 (Checkpoint)

## What is now implemented
1. Backend-authoritative gameplay APIs on Vercel routes (`/api/game/*`).
2. Firebase Auth token verification on backend using Identity Toolkit.
3. Room membership guard for all game actions.
4. Split room projections:
   - `roomsV2/{code}/public`
   - `roomsV2/{code}/private/{playerId}`
5. Encrypted authoritative engine at rest:
   - `roomsV2_engine/{code}` with AES-256-GCM payload.
6. Legacy `rooms/*` blocked by client rules and rejected via API join/reclaim with clear message.
7. LiveKit token endpoint hardened with auth + membership checks.

## API routes
1. `POST /api/game/create`
2. `POST /api/game/join`
3. `POST /api/game/reclaim`
4. `POST /api/game/start`
5. `POST /api/game/update-config`
6. `POST /api/game/action/throw`
7. `POST /api/game/action/pick`
8. `POST /api/game/action/knock`
9. `POST /api/game/action/timeout`
10. `POST /api/game/leave`
11. `POST /api/game/next-round`
12. `POST /api/game/play-again`

All routes require `Authorization: Bearer <firebase-id-token>` except create/join/reclaim still require auth but not pre-existing room membership.

## Security model
1. Clients do not write gameplay state directly.
2. Clients only read:
   - `roomsV2/{code}/public` (member-only)
   - `roomsV2/{code}/private/{myPlayerId}` (owner-only)
3. Engine state is encrypted and server-only:
   - Full hands, deck, pile internals are not readable by clients.
4. LiveKit identity is server-derived from membership (`roomCode:playerId`).

## Rules implemented in engine
1. Throw-first model.
2. Match/non-match split.
3. Match throw must leave at least 1 card.
4. Knock only when hand sum is below 25.
5. 45-second timeout handling.
6. Timeout arbiter via deterministic smallest lexicographic connected turn player.
7. Full inactivity cycle auto-delete when timeout streak reaches active count.
8. Leave removes one player only; room survives until empty.

## RTDB rules file
- `database.rules.json` now denies all by default and only allows:
  - member reads for `roomsV2/{code}/public`
  - owner reads for `roomsV2/{code}/private/{playerId}`
- No client writes allowed for v2 paths.

## Required environment variables
1. `FIREBASE_DATABASE_URL`
2. `FIREBASE_WEB_API_KEY` (or `VITE_FIREBASE_API_KEY` on server env)
3. `FIREBASE_SERVICE_ACCOUNT_JSON` (or `FIREBASE_ADMIN_*` fallback)
4. `GAME_STATE_ENC_KEY_B64` (base64 32-byte key)
5. `LIVEKIT_API_KEY`
6. `LIVEKIT_API_SECRET`
7. `LIVEKIT_URL`
8. `ALLOWED_ORIGINS`

## Checkpoint status matrix (v2)
1. Backend auth foundation: Implemented.
2. v2 create/join/reclaim APIs: Implemented.
3. Engine encryption + projections: Implemented.
4. Backend-authoritative throw/pick/knock/timeout/leave/round transitions: Implemented.
5. Client hook migration to API + v2 subscriptions: Implemented.
6. Voice token auth + membership hardening: Implemented.
7. Rules activation + legacy block: Implemented.

## Validation completed in workspace
1. `npm run build`: pass.
2. Dynamic Node import check for all new API modules: pass.
3. `npm run lint`: cannot run because ESLint config file is missing in repository.

## Manual release gate checklist
1. Player A cannot read Player B hand from RTDB.
2. Direct client write to score/turn/hands is denied.
3. Out-of-turn throw/pick/knock gets rejected.
4. Knock with sum >= 25 returns private rejection.
5. Match throw that empties hand gets rejected.
6. Timeout path advances turn and applies inactivity delete rule.
7. Non-member `/api/get-token` call fails.
8. Reclaim works only for same authenticated uid mapping.
