import fs from 'fs';
import os from 'os';
import path from 'path';

// Each test file gets its own throwaway data folder, so tests never touch real report data.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'community-hero-test-'));
process.env.JWT_SECRET = 'test-secret';
// Set (even to empty) so a developer's local .env can't make tests call the real Gemini API.
process.env.GEMINI_API_KEY = '';
