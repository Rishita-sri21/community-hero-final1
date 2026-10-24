import { describe, expect, it } from 'vitest';
import { DEFAULT_CENTER, ONBOARDING_DATA, centerForDistrict, distanceBetweenKm, districtLabel } from '../src/shared/neighborhoods';

describe('centerForDistrict', () => {
  it('finds the coordinates of every onboarding neighborhood from its saved label', () => {
    for (const country of ONBOARDING_DATA) {
      for (const area of country.areas) {
        for (const n of area.neighborhoods) {
          expect(centerForDistrict(districtLabel(country, area, n))).toEqual({ lat: n.lat, lng: n.lng });
        }
      }
    }
  });

  it('places Brooklyn in New York and Indiranagar in Bengaluru', () => {
    const brooklyn = centerForDistrict('Brooklyn (New York City, United States)');
    expect(brooklyn.lat).toBeCloseTo(40.68, 1);
    const indiranagar = centerForDistrict('Indiranagar (Bengaluru, India)');
    expect(indiranagar.lng).toBeCloseTo(77.64, 1);
  });

  it('falls back to the default center for unknown or missing districts', () => {
    expect(centerForDistrict('Westside')).toEqual(DEFAULT_CENTER);
    expect(centerForDistrict(undefined)).toEqual(DEFAULT_CENTER);
  });
});

describe('distanceBetweenKm', () => {
  it('matches known distances', () => {
    const london = { lat: 51.5074, lng: -0.1278 };
    const paris = { lat: 48.8566, lng: 2.3522 };
    expect(distanceBetweenKm(london, paris)).toBeCloseTo(344, -1);
    expect(distanceBetweenKm(london, london)).toBe(0);
  });
});
