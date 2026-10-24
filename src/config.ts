// Where the frontend sends API requests.
// - VITE_API_URL wins when set.
// - In development the Express server also serves the frontend, so same-origin ('') is right.
// - Production builds default to the deployed backend.
export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? '' : 'https://community-hero-mwwl.onrender.com');

// Uploaded photos are served by the API (/api/images/...). In production the API lives on
// another origin than the frontend, so those paths need the API's address in front.
export function assetUrl(src: string): string;
export function assetUrl(src: string | undefined): string | undefined;
export function assetUrl(src?: string) {
  return src && src.startsWith('/api/') ? `${API_URL}${src}` : src;
}

// Short "where" text for a report card: its distance when known, else its district
export function placeLabel(report: { distanceKm?: number; district: string }) {
  if (report.distanceKm === undefined || report.distanceKm === null) return report.district;
  if (report.distanceKm < 0.1) return 'Right here';
  if (report.distanceKm >= 100) return `${Math.round(report.distanceKm).toLocaleString()} km away`;
  return `${report.distanceKm} km away`;
}
