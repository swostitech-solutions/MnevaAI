// RapidAPI — Api Dojo Booking API
// Sign up: https://rapidapi.com/apidojo/api/booking
// Free tier: BASIC $0/mo
// Add to .env: RAPIDAPI_KEY=your_key

const RAPIDAPI_HOST = 'apidojo-booking-v1.p.rapidapi.com'
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
    throw new Error(`Booking API error ${res.status}: ${txt.slice(0, 120)}`)
  }
  return res.json()
}

// Step 1 — resolve city name → dest_id via /locations/auto-complete
export async function searchDestId(cityName) {
  const data = await rapidFetch(
    `/locations/auto-complete?text=${encodeURIComponent(cityName)}&languagecode=en-us`
  )
  const results = Array.isArray(data) ? data : (data?.result || [])
  // prefer exact name match, then region/city type, then first result
  const city = results.find(d => d.name?.toLowerCase() === cityName.toLowerCase())
    || results.find(d => d.dest_type === 'city' || d.dest_type === 'region')
    || results[0]
  if (!city) throw new Error(`City "${cityName}" not found`)
  return {
    destId:   String(city.dest_id || city.city_ufi || city.id),
    destType: city.dest_type || 'city',
    label:    city.city_name || city.label || cityName,
  }
}

// Step 2 — search hotels via /properties/list
export async function searchHotels({ cityName, checkIn, checkOut, adults = 1, rooms = 1 }) {
  const { destId, destType } = await searchDestId(cityName)

  const qs = new URLSearchParams({
    dest_ids:           destId,
    search_type:        destType,
    arrival_date:       checkIn,
    departure_date:     checkOut,
    adults:             adults,
    room_qty:           rooms,
    order_by:           'popularity',
    currency_code:      'INR',
    languagecode:       'en-us',
    page_number:        0,
    units:              'metric',
  })

  const data = await rapidFetch(`/properties/list?${qs}`)
  const results = data?.result || []

  return results.slice(0, 8).map(h => ({
    hotelId:     String(h.hotel_id),
    offerId:     String(h.hotel_id),
    name:        h.hotel_name || h.hotel_name_trans || 'Unknown Hotel',
    rating:      h.class ? Math.round(h.class) : null,
    reviewScore: h.review_score ? Number(h.review_score).toFixed(1) : null,
    reviewWord:  h.review_score_word || null,
    address:     h.address_trans || h.address || '',
    city:        h.city_trans || h.city || cityName,
    photo:       h.main_photo_url || null,
    checkIn,
    checkOut,
    roomType:    h.matching_units_configuration?.unit_configuration_label || 'Standard Room',
    price:       parseFloat(h.min_total_price || h.price_breakdown?.gross_price || 0),
    currency:    h.currency_code || h.currencycode || 'INR',
    boardType:   h.hotel_include_breakfast ? 'Breakfast Included' : 'Room Only',
    freeCancel:  !!h.is_free_cancellable,
    hasPool:     !!h.has_swimming_pool,
    hasParking:  !!h.has_free_parking,
    url:         h.url || null,
  })).filter(h => h.price > 0)
}

// Step 3 — generate booking reference + deep link (no public booking endpoint)
export async function bookHotel({ hotelId, hotelName, roomType, price, checkIn, checkOut, city, guestName }) {
  const bookingId = 'BKG' + Date.now().toString(36).toUpperCase()
  const slug = (hotelName || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const deepLink = `https://www.booking.com/hotel/in/${encodeURIComponent(slug)}.html?checkin=${checkIn}&checkout=${checkOut}`
  return {
    bookingId,
    providerRef: hotelId,
    status:      'REDIRECT_TO_PROVIDER',
    deepLink,
    message:     'Redirecting to Booking.com to complete payment',
  }
}
