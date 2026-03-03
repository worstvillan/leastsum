import express from 'express';
import dotenv from 'dotenv';
import tokenHandler from './api/get-token.js';

// Load secrets from your .env.local file
dotenv.config({ path: '.env.local' });

const app = express();
app.use(express.json());

app.options('/get-token', tokenHandler);
app.post('/get-token', tokenHandler);
app.all('/get-token', tokenHandler);

const PORT = 3001;
app.listen(PORT, () => console.log(`✅ Local token server running on port ${PORT}`));
