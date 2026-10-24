// Neighborhoods offered during onboarding, with the coordinates used to center
// the map and sort nearby reports. Shared by the server and the frontend.

export interface Neighborhood {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  color: string;
  description: string;
  lat: number;
  lng: number;
}

export interface Area {
  id: string;
  name: string;
  neighborhoods: Neighborhood[];
}

export interface Country {
  id: string;
  name: string;
  flag: string;
  areas: Area[];
}

export const ONBOARDING_DATA: Country[] = [
  {
    id: 'uk',
    name: 'United Kingdom',
    flag: '🇬🇧',
    areas: [
      {
        id: 'london',
        name: 'London',
        neighborhoods: [
          {
            id: 'westminster',
            lat: 51.4975,
            lng: -0.1357,
            name: 'Westminster',
            tagline: 'Historic Government Hub',
            icon: 'location_city',
            color: 'from-blue-500 to-indigo-600',
            description: 'Central London borough on the River Thames, containing the House of Commons and historic landmarks.'
          },
          {
            id: 'camden',
            lat: 51.539,
            lng: -0.1426,
            name: 'Camden Town',
            tagline: 'Creative Cultural Hub',
            icon: 'palette',
            color: 'from-fuchsia-500 to-pink-600',
            description: 'Famous canal-side neighborhood known for alternative fashion, live music, and diverse markets.'
          },
          {
            id: 'kensington',
            lat: 51.4991,
            lng: -0.1938,
            name: 'Kensington & Chelsea',
            tagline: 'Eco-Green Residential Parks',
            icon: 'park',
            color: 'from-emerald-500 to-teal-600',
            description: 'Affluent Royal Borough with sprawling gardens, natural history museums, and active tree planting.'
          }
        ]
      },
      {
        id: 'manchester',
        name: 'Manchester',
        neighborhoods: [
          {
            id: 'northern_quarter',
            lat: 53.484,
            lng: -2.236,
            name: 'Northern Quarter',
            tagline: 'Artistic & Cycle Lanes',
            icon: 'directions_bike',
            color: 'from-amber-500 to-orange-600',
            description: 'Vibrant neighborhood with street murals, creative workspaces, and low-emission cycle networks.'
          },
          {
            id: 'salford_quays',
            lat: 53.471,
            lng: -2.296,
            name: 'Salford Quays',
            tagline: 'Scenic Riverfront Area',
            icon: 'water_ec',
            color: 'from-cyan-500 to-blue-600',
            description: 'Regenerated docklands waterfront with community water quality sensors and solar walkways.'
          },
          {
            id: 'didsbury',
            lat: 53.4167,
            lng: -2.231,
            name: 'Didsbury',
            tagline: 'Cosy Green Woodlands',
            icon: 'forest',
            color: 'from-lime-600 to-emerald-700',
            description: 'Sylvan residential area dedicated to public orchard restoration and park clean-ups.'
          }
        ]
      }
    ]
  },
  {
    id: 'us',
    name: 'United States',
    flag: '🇺🇸',
    areas: [
      {
        id: 'new_york',
        name: 'New York City',
        neighborhoods: [
          {
            id: 'manhattan',
            lat: 40.7831,
            lng: -73.9712,
            name: 'Manhattan',
            tagline: 'High Density Transit Core',
            icon: 'subway',
            color: 'from-blue-500 to-cyan-600',
            description: 'Densely populated island borough with community pocket gardens and green skyscraper initiatives.'
          },
          {
            id: 'brooklyn',
            lat: 40.6782,
            lng: -73.9442,
            name: 'Brooklyn',
            tagline: 'Eco-Green Parks & Art Hub',
            icon: 'brush',
            color: 'from-purple-500 to-indigo-600',
            description: 'Known for brownstones, dynamic community compost yards, and tree pit restoration squads.'
          },
          {
            id: 'queens',
            lat: 40.7282,
            lng: -73.7949,
            name: 'Queens',
            tagline: 'Diverse Multi-cultural Blocks',
            icon: 'diversity_3',
            color: 'from-amber-500 to-rose-600',
            description: 'One of the most diverse areas in the world, with active volunteer safety and trash cleanup teams.'
          }
        ]
      },
      {
        id: 'san_francisco',
        name: 'San Francisco',
        neighborhoods: [
          {
            id: 'mission_district',
            lat: 37.7599,
            lng: -122.4148,
            name: 'Mission District',
            tagline: 'Art & Pedestrian Streets',
            icon: 'directions_walk',
            color: 'from-orange-500 to-red-600',
            description: 'Sun-drenched, mural-filled avenues focusing on bicycle transit and public street trees.'
          },
          {
            id: 'presidio',
            lat: 37.7989,
            lng: -122.4662,
            name: 'The Presidio',
            tagline: 'National Park & Trails',
            icon: 'park',
            color: 'from-emerald-500 to-teal-600',
            description: 'Sprawling former military base turned into a rich biodiverse national park overlooking the Golden Gate.'
          },
          {
            id: 'soma',
            lat: 37.7785,
            lng: -122.4056,
            name: 'SOMA',
            tagline: 'Tech Hub & Urban High-rises',
            icon: 'lan',
            color: 'from-slate-600 to-slate-800',
            description: 'Industrial warehouses turned technology district with rooftop beehives and community makerspaces.'
          }
        ]
      }
    ]
  },
  {
    id: 'ca',
    name: 'Canada',
    flag: '🇨🇦',
    areas: [
      {
        id: 'toronto',
        name: 'Toronto',
        neighborhoods: [
          {
            id: 'downtown_toronto',
            lat: 43.6532,
            lng: -79.3832,
            name: 'Downtown Toronto',
            tagline: 'High-Rise Transit Core',
            icon: 'location_city',
            color: 'from-blue-600 to-indigo-700',
            description: 'Major city center with rapid underground transit networks and green roof regulations.'
          },
          {
            id: 'high_park',
            lat: 43.6465,
            lng: -79.4637,
            name: 'High Park',
            tagline: 'Eco-Green Botanical Zone',
            icon: 'park',
            color: 'from-emerald-500 to-lime-600',
            description: 'Massive urban park with native black oak savannahs, cherry blossom groves, and local lake restoration.'
          },
          {
            id: 'distillery',
            lat: 43.6503,
            lng: -79.3596,
            name: 'Distillery District',
            tagline: 'Historic Pedestrian Hub',
            icon: 'interests',
            color: 'from-amber-600 to-yellow-700',
            description: 'Cobblestone-only pedestrian streets lined with heritage brick architecture and eco-boutiques.'
          }
        ]
      },
      {
        id: 'vancouver',
        name: 'Vancouver',
        neighborhoods: [
          {
            id: 'stanley_park',
            lat: 49.3043,
            lng: -123.1443,
            name: 'Stanley Park',
            tagline: 'Coastal Woodlands & Trails',
            icon: 'forest',
            color: 'from-teal-600 to-emerald-700',
            description: 'An iconic coastal rainforest featuring massive red cedars, shoreline preservation, and dynamic seawalls.'
          },
          {
            id: 'kitsilano',
            lat: 49.2684,
            lng: -123.1683,
            name: 'Kitsilano',
            tagline: 'Beachfront Parks & Cycle Lanes',
            icon: 'beach_access',
            color: 'from-cyan-500 to-blue-600',
            description: 'Laid-back neighborhood focusing on zero-waste packaging, beach cleanups, and shoreline health.'
          },
          {
            id: 'gastown',
            lat: 49.2828,
            lng: -123.1088,
            name: 'Gastown',
            tagline: 'Historic Brick Streets',
            icon: 'history',
            color: 'from-amber-700 to-stone-600',
            description: 'Famous historic area with dynamic steam clocks, active community centers, and alleyway gardens.'
          }
        ]
      }
    ]
  },
  {
    id: 'au',
    name: 'Australia',
    flag: '🇦🇺',
    areas: [
      {
        id: 'sydney',
        name: 'Sydney',
        neighborhoods: [
          {
            id: 'darling_harbour',
            lat: -33.8748,
            lng: 151.2002,
            name: 'Darling Harbour',
            tagline: 'Scenic Waterfront Core',
            icon: 'sailing',
            color: 'from-cyan-500 to-sky-600',
            description: 'Active urban harbor area featuring harbor cleanups, marine protection panels, and pedestrian bridges.'
          },
          {
            id: 'newtown',
            lat: -33.897,
            lng: 151.1793,
            name: 'Newtown',
            tagline: 'Creative Art & Recycling Zone',
            icon: 'recycling',
            color: 'from-purple-500 to-rose-600',
            description: 'Eccentric hub with dynamic mural tours, solar-powered venues, and second-hand reuse initiatives.'
          },
          {
            id: 'paddington',
            lat: -33.8848,
            lng: 151.2264,
            name: 'Paddington',
            tagline: 'Historic Terraces & Green Walkways',
            icon: 'home',
            color: 'from-green-600 to-teal-700',
            description: 'Victorian-era terrace houses, leafy narrow lanes, and active public community garden patches.'
          }
        ]
      },
      {
        id: 'melbourne',
        name: 'Melbourne',
        neighborhoods: [
          {
            id: 'fitzroy',
            lat: -37.7987,
            lng: 144.9784,
            name: 'Fitzroy',
            tagline: 'Artistic Lanes & Cafes',
            icon: 'palette',
            color: 'from-pink-500 to-violet-600',
            description: 'Creative hub focusing on urban pocket farms, rain gardens, and pedestrian-first shopping alleys.'
          },
          {
            id: 'royal_botanic',
            lat: -37.8304,
            lng: 144.9796,
            name: 'Royal Botanic Gardens',
            tagline: 'Eco-Green Gardens',
            icon: 'park',
            color: 'from-emerald-500 to-green-700',
            description: 'Enormous botanical gardens with greywater filtration wetlands and environmental training hubs.'
          },
          {
            id: 'docklands',
            lat: -37.8148,
            lng: 144.9466,
            name: 'Docklands',
            tagline: 'Modern High-Rise Waterfront',
            icon: 'domain',
            color: 'from-blue-500 to-indigo-600',
            description: 'Modern harbor-side high-rises with extensive wind turbine setups and low-carbon materials.'
          }
        ]
      }
    ]
  },
  {
    id: 'in',
    name: 'India',
    flag: '🇮🇳',
    areas: [
      {
        id: 'delhi',
        name: 'Delhi',
        neighborhoods: [
          {
            id: 'connaught_place',
            lat: 28.6315,
            lng: 77.2167,
            name: 'Connaught Place',
            tagline: 'High Traffic Commercial Core',
            icon: 'circle',
            color: 'from-blue-500 to-slate-700',
            description: 'Georgian-style circular colonnade center with intensive air-filtration systems and civic squads.'
          },
          {
            id: 'lodhi_gardens',
            lat: 28.5931,
            lng: 77.2197,
            name: 'Lodhi Gardens',
            tagline: 'Historic Heritage Green Zone',
            icon: 'park',
            color: 'from-emerald-600 to-teal-700',
            description: 'Sprawling park with tombs from the 15th century, ancient trees, bird sanctuaries, and walking trails.'
          },
          {
            id: 'vasant_kunj',
            lat: 28.52,
            lng: 77.158,
            name: 'Vasant Kunj',
            tagline: 'Cozy Residential Parks',
            icon: 'roofing',
            color: 'from-amber-500 to-orange-600',
            description: 'Tranquil suburban areas with active resident welfare associations focusing on zero waste & water harvesting.'
          }
        ]
      },
      {
        id: 'bengaluru',
        name: 'Bengaluru',
        neighborhoods: [
          {
            id: 'indiranagar',
            lat: 12.9784,
            lng: 77.6408,
            name: 'Indiranagar',
            tagline: 'Vibrant Food & Pedestrian Hub',
            icon: 'restaurant',
            color: 'from-fuchsia-500 to-purple-600',
            description: 'Bustling tree-lined avenues with dynamic composting programs for cafes and active recycling hubs.'
          },
          {
            id: 'cubbon_park',
            lat: 12.9763,
            lng: 77.5929,
            name: 'Cubbon Park',
            tagline: 'Eco-Green Forest Reserve',
            icon: 'forest',
            color: 'from-green-600 to-emerald-700',
            description: 'A 300-acre green lung in the heart of the tech city, filled with bamboo groves and walking trails.'
          },
          {
            id: 'whitefield',
            lat: 12.9698,
            lng: 77.75,
            name: 'Whitefield',
            tagline: 'Modern Tech Sector & Walkways',
            icon: 'lan',
            color: 'from-sky-500 to-indigo-600',
            description: 'Tech-park hub with smart waste disposal bins, solar street lamps, and community water sensor monitors.'
          }
        ]
      }
    ]
  }
];

/** The text saved as a user's district, e.g. "Brooklyn (New York City, United States)". */
export function districtLabel(country: Country, area: Area, neighborhood: Neighborhood) {
  return `${neighborhood.name} (${area.name}, ${country.name})`;
}

// Used when a user's district isn't one of the neighborhoods above (e.g. older accounts)
export const DEFAULT_CENTER = { lat: 40.7128, lng: -74.006 }; // New York City

/** Map center for a saved district, falling back to DEFAULT_CENTER. */
export function centerForDistrict(district?: string | null): { lat: number; lng: number } {
  for (const country of ONBOARDING_DATA) {
    for (const area of country.areas) {
      for (const n of area.neighborhoods) {
        if (district === districtLabel(country, area, n)) return { lat: n.lat, lng: n.lng };
      }
    }
  }
  return DEFAULT_CENTER;
}

/** Straight-line distance in km between two points (haversine formula). */
export function distanceBetweenKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
