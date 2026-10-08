const form = document.querySelector('#search-form');
const input = document.querySelector('#destination');
const submitButton = form.querySelector('button[type="submit"]');
const notice = document.querySelector('#notice');
const results = document.querySelector('#results');
const emptyState = document.querySelector('#empty-state');
const attractionList = document.querySelector('#attraction-list');
let activeRequest = 0;
let locationTimezone = 'UTC';
let pendingCandidates = [];

const weatherDescriptions = {
  0: ['Clear skies', '☼'], 1: ['Mostly clear', '☀'], 2: ['A few clouds', '⛅'], 3: ['Overcast', '☁'],
  45: ['Misty', '≋'], 48: ['Foggy', '≋'], 51: ['Light drizzle', '☂'], 53: ['Drizzle', '☂'], 55: ['Steady drizzle', '☂'],
  56: ['Icy drizzle', '❄'], 57: ['Freezing drizzle', '❄'], 61: ['Light rain', '☂'], 63: ['Rain', '☂'], 65: ['Heavy rain', '☂'],
  66: ['Icy rain', '❄'], 67: ['Freezing rain', '❄'], 71: ['Light snow', '❄'], 73: ['Snow', '❄'], 75: ['Heavy snow', '❄'],
  77: ['Snow grains', '❄'], 80: ['Passing showers', '☂'], 81: ['Showers', '☂'], 82: ['Heavy showers', '☂'],
  85: ['Snow showers', '❄'], 86: ['Heavy snow showers', '❄'], 95: ['Thunderstorms', 'ϟ'], 96: ['Thunder & hail', 'ϟ'], 99: ['Thunder & hail', 'ϟ']
};

function setNotice(message, kind = 'info') {
  notice.textContent = message;
  notice.dataset.kind = kind;
  notice.hidden = !message;
}

function prettyPlace(address = {}) {
  const locality = address.city || address.town || address.village || address.municipality || address.county;
  const region = address.state || address.region;
  return [locality, region].filter(Boolean).join(', ');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

async function geocode(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  const parameters = { q: query, format: 'jsonv2', addressdetails: '1', limit: '8' };
  if (/^\d{5}(?:-\d{4})?$/.test(query)) parameters.countrycodes = 'us';
  url.search = new URLSearchParams(parameters);
  const matches = await fetchJson(url);
  if (!matches.length) throw new Error('We couldn’t find that destination. Try a ZIP code, landmark, or a more specific place name.');
  return matches;
}

async function fetchWeather(latitude, longitude) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude, longitude, current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
    daily: 'sunset', temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', timezone: 'auto', forecast_days: '1'
  });
  return fetchJson(url);
}

function showClock() {
  const now = new Date();
  document.querySelector('#local-time').textContent = new Intl.DateTimeFormat([], { timeZone: locationTimezone, hour: 'numeric', minute: '2-digit' }).format(now);
  document.querySelector('#local-date').textContent = new Intl.DateTimeFormat([], { timeZone: locationTimezone, weekday: 'long', month: 'long', day: 'numeric' }).format(now);
}

function formatLocalTimeValue(value) {
  const [hour, minute] = value.split('T')[1].split(':').map(Number);
  const clockTime = new Date(Date.UTC(2000, 0, 1, hour, minute));
  return new Intl.DateTimeFormat([], { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' }).format(clockTime);
}

function showWeather(weather) {
  const current = weather.current;
  const [description, icon] = weatherDescriptions[current.weather_code] || ['Changeable skies', '☁'];
  document.querySelector('#weather-condition').textContent = description;
  document.querySelector('#weather-symbol').textContent = icon;
  document.querySelector('#temperature').textContent = Math.round(current.temperature_2m);
  document.querySelector('#feels-like').textContent = `Feels like ${Math.round(current.apparent_temperature)}°`;
  document.querySelector('#humidity').textContent = `${current.relative_humidity_2m}%`;
  document.querySelector('#wind').textContent = `${Math.round(current.wind_speed_10m)} mph`;
  document.querySelector('#sunset').textContent = weather.daily?.sunset?.[0]
    ? formatLocalTimeValue(weather.daily.sunset[0])
    : 'Unavailable';
}

function distanceMiles(firstLat, firstLon, secondLat, secondLon) {
  const radians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = radians(secondLat - firstLat);
  const longitudeDelta = radians(secondLon - firstLon);
  const arc = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(firstLat)) * Math.cos(radians(secondLat)) * Math.sin(longitudeDelta / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

function categoryFor(tags) {
  return tags.tourism?.replaceAll('_', ' ') || tags.historic?.replaceAll('_', ' ') || tags.leisure?.replaceAll('_', ' ') || 'local point of interest';
}

function renderAttractions(elements, latitude, longitude) {
  const places = elements.map(element => {
    const tags = element.tags || {};
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (!tags.name || lat == null || lon == null) return null;
    return { name: tags.name, kind: categoryFor(tags), distance: distanceMiles(latitude, longitude, lat, lon), lat, lon };
  }).filter(Boolean).sort((a, b) => a.distance - b.distance);
  const uniquePlaces = [...new Map(places.map(place => [place.name.toLowerCase(), place])).values()].slice(0, 5);

  if (!uniquePlaces.length) {
    attractionList.innerHTML = '<p class="list-message">No named attractions turned up nearby. Try another destination or explore a wider area.</p>';
    return false;
  }
  attractionList.innerHTML = uniquePlaces.map((place, index) => {
    const mapUrl = `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=15/${place.lat}/${place.lon}`;
    return `<article class="attraction" style="animation-delay:${index * 65}ms">
      <span class="attraction-number">0${index + 1}</span>
      <a class="attraction-copy attraction-link" href="${mapUrl}" target="_blank" rel="noreferrer">
        <span class="attraction-name">${escapeHtml(place.name)}</span><span class="attraction-type">${escapeHtml(place.kind)}</span>
      </a>
      <span class="attraction-distance">${place.distance < 0.1 ? 'nearby' : `${place.distance.toFixed(1)} mi`}</span>
    </article>`;
  }).join('');
  return true;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function fetchAttractions(latitude, longitude) {
  const query = `[out:json][timeout:18];(node(around:25000,${latitude},${longitude})["tourism"~"attraction|museum|zoo|theme_park|viewpoint|gallery|aquarium"];way(around:25000,${latitude},${longitude})["tourism"~"attraction|museum|zoo|theme_park|viewpoint|gallery|aquarium"];relation(around:25000,${latitude},${longitude})["tourism"~"attraction|museum|zoo|theme_park|viewpoint|gallery|aquarium"];node(around:25000,${latitude},${longitude})["historic"];way(around:25000,${latitude},${longitude})["historic"];node(around:25000,${latitude},${longitude})["leisure"="park"];way(around:25000,${latitude},${longitude})["leisure"="park"];);out center tags 60;`;
  try {
    const data = await fetchJson('https://overpass.private.coffee/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(22000)
    });
    if (renderAttractions(data.elements || [], latitude, longitude)) return;
  } catch {}

  const wikidataQuery = `SELECT DISTINCT ?place ?placeLabel ?coord ?distance WHERE { SERVICE wikibase:around { ?place wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(${longitude} ${latitude})"^^geo:wktLiteral. bd:serviceParam wikibase:radius "15". bd:serviceParam wikibase:distance ?distance. } VALUES ?type { wd:Q570116 wd:Q33506 wd:Q46169 } ?place wdt:P31 ?type. SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY ?distance LIMIT 15`;
  const wikidataUrl = new URL('https://query.wikidata.org/sparql');
  wikidataUrl.search = new URLSearchParams({ query: wikidataQuery });
  const data = await fetchJson(wikidataUrl, {
    headers: { Accept: 'application/sparql-results+json' },
    signal: AbortSignal.timeout(20000)
  });
  const places = (data.results?.bindings || []).flatMap(result => {
    const coordinates = result.coord?.value.match(/^Point\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)$/);
    if (!coordinates || !result.placeLabel?.value) return [];
    return [{ lat: Number(coordinates[2]), lon: Number(coordinates[1]), tags: { name: result.placeLabel.value, tourism: 'attraction' } }];
  });
  if (renderAttractions(places, latitude, longitude)) {
    document.querySelector('#attraction-source').textContent = 'Places from Wikidata';
  }
}

function showPlaceChoices(places) {
  pendingCandidates = places;
  notice.dataset.kind = 'info';
  notice.innerHTML = `A few places match that name. Choose your destination:<div class="candidate-options">${places.map((place, index) => `<button class="candidate-option" type="button" data-place-index="${index}">${escapeHtml(place.display_name)}</button>`).join('')}</div>`;
  notice.hidden = false;
}

async function loadPlace(place, requestId) {
  const latitude = Number(place.lat);
  const longitude = Number(place.lon);
  const weather = await fetchWeather(latitude, longitude);
  if (requestId !== activeRequest) return;

  locationTimezone = weather.timezone || 'UTC';
  const localName = prettyPlace(place.address);
  document.querySelector('#location-name').textContent = localName || place.name || input.value;
  document.querySelector('#location-detail').textContent = place.display_name;
  showWeather(weather);
  showClock();
  results.hidden = false;
  emptyState.hidden = true;
  setNotice('');
  document.querySelector('#nearby-label').textContent = 'WITHIN 15 MI';
  try {
    await fetchAttractions(latitude, longitude);
  } catch {
    attractionList.innerHTML = '<p class="list-message">Nearby places are temporarily unavailable. The forecast is still here.</p>';
    setNotice('Nearby places are temporarily unavailable. Your local time and forecast are ready.', 'error');
  }
}

async function searchDestination(query) {
  const requestId = ++activeRequest;
  submitButton.disabled = true;
  submitButton.querySelector('span:first-child').textContent = 'Finding your place';
  emptyState.hidden = true;
  results.hidden = true;
  attractionList.replaceChildren();
  document.querySelector('#weather-condition').textContent = 'Gathering the forecast...';
  setNotice('Looking up your destination and checking nearby places…');

  try {
    const places = await geocode(query);
    if (requestId !== activeRequest) return;
    const exactMatches = places.filter(place => place.name?.toLowerCase() === query.toLowerCase());
    if (exactMatches.length > 1) {
      showPlaceChoices(exactMatches);
      return;
    }
    await loadPlace(places[0], requestId);
  } catch (error) {
    if (requestId !== activeRequest) return;
    if (results.hidden) emptyState.hidden = false;
    setNotice(error.message?.includes('Failed to fetch') || error.name === 'AbortError' || error.name === 'TimeoutError'
      ? 'A public map service is taking a breather. Your forecast may still load; try nearby places again in a moment.'
      : error.message || 'Something went wrong while looking up that destination.', 'error');
  } finally {
    if (requestId === activeRequest) {
      submitButton.disabled = false;
      submitButton.querySelector('span:first-child').textContent = 'Find my forecast';
    }
  }
}

notice.addEventListener('click', event => {
  const button = event.target.closest('[data-place-index]');
  if (!button) return;
  const place = pendingCandidates[Number(button.dataset.placeIndex)];
  if (!place) return;
  pendingCandidates = [];
  const requestId = ++activeRequest;
  setNotice('Getting the local forecast and nearby places…');
  loadPlace(place, requestId).catch(error => {
    if (requestId !== activeRequest) return;
    setNotice(error.message || 'Could not load that destination. Please try again.', 'error');
    emptyState.hidden = false;
  });
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const query = input.value.trim();
  if (query) searchDestination(query);
});

document.querySelector('.example-button').addEventListener('click', event => {
  input.value = event.currentTarget.dataset.destination;
  searchDestination(input.value);
});

setInterval(showClock, 15000);
