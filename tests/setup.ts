process.env.JWT_SECRET = 'test-secret';
// Set (even to empty) so a developer's local .env can't make tests call the real Gemini API.
process.env.GEMINI_API_KEY = '';
