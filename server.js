import express from 'express';
import dotenv from 'dotenv';
import gameHandler from './api/game.js';
import tokenHandler from './api/get-token.js';

// Load secrets from your .env.local file
dotenv.config({ path: '.env.local' });

const app = express();
app.use(express.json());

// API parity with serverless routes
app.all('/api/game', gameHandler);
app.all('/api/get-token', tokenHandler);

// Backward-compatible token route alias
app.all('/get-token', tokenHandler);

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => console.log(`✅ Local API server running on port ${PORT}`));
