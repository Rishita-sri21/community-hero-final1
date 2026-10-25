process.env.JWT_SECRET = 'test-secret';
// Set (even to empty) so a developer's local .env can't make tests call the real Gemini API.
process.env.GEMINI_API_KEY = '';
// Keep test output readable; tests that check logging raise the level themselves.
process.env.LOG_LEVEL = 'error';
// Many tests insert documents directly, which the read caches can't see; tests/cache.test.ts turns them on.
process.env.READ_CACHE = 'off';
