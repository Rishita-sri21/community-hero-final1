// Where the frontend sends API requests.
// - VITE_API_URL wins when set.
// - In development the Express server also serves the frontend, so same-origin ('') is right.
// - Production builds default to the deployed backend.
export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? '' : 'https://community-hero-mwwl.onrender.com');
