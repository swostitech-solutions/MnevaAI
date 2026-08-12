// RapidAPI — Flights Scraper Sky (Skyscanner data)
// https://rapidapi.com/apiheya/api/flights-sky
// Same RAPIDAPI_KEY as hotel — subscribe to BASIC (free)

const RAPIDAPI_HOST = 'flights-sky.p.rapidapi.com'
const BASE = `https://${RAPIDAPI_HOST}`

function headers() {
  if (!process.env.RAPIDAPI_KEY) throw new Error('RAPIDAPI_KEY is required in .env')
  return {
    'X-RapidAPI-Key':  process.env.RAPIDAPI_KEY,
    'X-RapidAPI-Host': RAPIDAPI_HOST,
  }
}

async function rapidFetch(path) {
  const res = await fetch(`${BASE}${path}`, { headers: headers() })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Flights API error ${res.status}: ${txt.slice(0, 120)}`)
  }
  return res.json()
}

// Search one-way flights — fromEntityId/toEntityId are IATA codes (BLR, BOM, DEL…)
export async function searchFlights({ from, to, date, currency = 'INR' }) {
  const qs = new URLSearchParams({
    fromEntityId: from.toUpperCase(),
    toEntityId:   to.toUpperCase(),
    departDate:   date,           // YYYY-MM-DD
    currency,
    market:       'IN',
    locale:       'en-US',
  })

  const data = await rapidFetch(`/flights/search-one-way?${qs}`)
  if (!data?.status && data?.errors) {
    const errMsg = Object.values(data.errors).join(', ')
    throw new Error(errMsg)
  }

  const itineraries = data?.data?.itineraries || []
  if (!itineraries.length) throw new Error('No flights found for this route and date')

  return itineraries.slice(0, 8).map(f => {
    const leg     = f.legs[0]
    const carrier = leg.carriers.marketing[0]
    const h = Math.floor(leg.durationInMinutes / 60)
    const m = leg.durationInMinutes % 60
    return {
      id:        f.id,
      airline:   carrier.name,
      logo:      carrier.logoUrl || null,
      flightCode: carrier.alternateId + '-' + f.id.split('-')[0].slice(-4),
      from:      leg.origin.displayCode,
      to:        leg.destination.displayCode,
      fromCity:  leg.origin.city,
      toCity:    leg.destination.city,
      depart:    leg.departure.slice(11, 16),
      arrive:    leg.arrival.slice(11, 16),
      duration:  `${h}h ${m}m`,
      stops:     leg.stopCount,
      price:     f.price.raw,
      priceFormatted: f.price.formatted,
      deepLink:  `https://www.skyscanner.net/transport/flights/${leg.origin.displayCode.toLowerCase()}/${leg.destination.displayCode.toLowerCase()}/${date.replace(/-/g, '').slice(2)}/`,
    }
  })
}

// Book — generate local reference + deep link to Skyscanner for payment
export function bookFlight({ flightId, airline, flightCode, from, to, depart, arrive, date, cabinClass, seat, price }) {
  const bookingId = 'FLT' + Date.now().toString(36).toUpperCase()
  const deepLink  = `https://www.skyscanner.net/transport/flights/${from.toLowerCase()}/${to.toLowerCase()}/${date.replace(/-/g, '').slice(2)}/`
  return {
    bookingId,
    status:   'REDIRECT_TO_PROVIDER',
    deepLink,
    airline, flightCode, from, to, depart, arrive, date, cabinClass, seat, price,
    message:  'Redirecting to Skyscanner to complete booking',
  }
}
