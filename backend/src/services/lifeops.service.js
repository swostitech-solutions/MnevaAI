import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CAB_TYPES = [
  { type: 'bike',  label: 'Bike',       platform: 'Rapido', ratePerKm: 6,  baseFare: 20,  etaMin: 5  },
  { type: 'auto',  label: 'Auto',       platform: 'Ola',    ratePerKm: 12, baseFare: 30,  etaMin: 7  },
  { type: 'mini',  label: 'Mini',       platform: 'Ola',    ratePerKm: 14, baseFare: 50,  etaMin: 8  },
  { type: 'sedan', label: 'Prime Sedan',platform: 'Ola',    ratePerKm: 18, baseFare: 80,  etaMin: 10 },
  { type: 'xl',    label: 'XL',         platform: 'Ola',    ratePerKm: 22, baseFare: 100, etaMin: 12 },
];

const DRIVER_NAMES = ['Ravi Kumar', 'Suresh M', 'Arjun S', 'Kiran B', 'Mohan R', 'Deepak T'];
const CAR_MODELS   = { bike: 'Honda Activa', auto: 'Bajaj Auto', mini: 'Maruti Swift', sedan: 'Honda City', xl: 'Toyota Innova' };

function randomDriver() { return DRIVER_NAMES[Math.floor(Math.random() * DRIVER_NAMES.length)]; }
function randomRating() { return (4.0 + Math.random() * 0.9).toFixed(1); }

export async function getDistanceMatrix(pickup, destination) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(pickup)}&destinations=${encodeURIComponent(destination)}&key=${key}`;
    const r = await fetch(url);
    const data = await r.json();
    const el = data?.rows?.[0]?.elements?.[0];
    if (el?.status !== 'OK') return null;
    return {
      distanceM: el.distance.value,
      distanceText: el.distance.text,
      durationText: el.duration.text,
    };
  } catch { return null; }
}

export function buildCabOptions(matrix) {
  const km = matrix ? matrix.distanceM / 1000 : 8; // fallback 8km
  return CAB_TYPES.map(c => ({
    type: c.type,
    label: c.label,
    platform: c.platform,
    fare: Math.round(c.baseFare + c.ratePerKm * km),
    etaMin: c.etaMin,
    driver: randomDriver(),
    rating: randomRating(),
    carModel: CAR_MODELS[c.type],
  }));
}

export async function getFoodSuggestions(userId, query) {
  try {
    const prompt = `You are a food ordering assistant for an Indian urban professional.
Query: "${query || 'suggest something good'}"
Return a JSON array of exactly 3 restaurant suggestions. Each object must have:
- restaurant (string)
- cuisine (string)
- platform ("swiggy" or "zomato")
- rating (number 3.5-4.9)
- deliveryTime (string e.g. "30-40 mins")
- items (array of 3 objects with name and price in INR)
- totalAmount (number, sum of item prices)
Respond with ONLY the JSON array, no markdown.`;

    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 600,
    });

    const suggestions = JSON.parse(res.choices[0].message.content.trim());
    return { suggestions };
  } catch {
    return {
      suggestions: [
        { restaurant: 'Biryani Blues', cuisine: 'Biryani', platform: 'swiggy', rating: 4.3, deliveryTime: '35-45 mins', items: [{ name: 'Chicken Biryani', price: 249 }, { name: 'Raita', price: 49 }, { name: 'Coke', price: 60 }], totalAmount: 358 },
        { restaurant: "Domino's Pizza", cuisine: 'Pizza', platform: 'swiggy', rating: 4.1, deliveryTime: '25-35 mins', items: [{ name: 'Margherita Pizza', price: 199 }, { name: 'Garlic Bread', price: 99 }, { name: 'Pepsi', price: 60 }], totalAmount: 358 },
        { restaurant: 'Behrouz Biryani', cuisine: 'Mughlai', platform: 'zomato', rating: 4.5, deliveryTime: '40-50 mins', items: [{ name: 'Royal Biryani', price: 349 }, { name: 'Shorba', price: 79 }, { name: 'Gulab Jamun', price: 89 }], totalAmount: 517 },
      ],
    };
  }
}
