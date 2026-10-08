# Afterglow

A small, responsive destination field guide for local time, current weather, and nearby places. Search by postal code, landmark, or place name.

## Run

No build step or API key is needed. Open `index.html` in a modern browser. For a local server, run:

```sh
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

The app requests live data from Open-Meteo, Nominatim, Overpass, and Wikidata. An internet connection is required; public services can occasionally rate-limit or be unavailable.

## Deploy to GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the site when changes are pushed to `main`. In the repository’s **Settings → Pages**, set the build and deployment source to **GitHub Actions**. After the workflow completes, open:

<https://damonsnature.github.io/Afterglow/>

## Data attribution

- Weather forecast: [Open-Meteo](https://open-meteo.com/)
- Destination search and attraction data: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), via Nominatim and Overpass API
- Attraction fallback: [Wikidata](https://www.wikidata.org/), via its public SPARQL service

This prototype uses public endpoints directly in the browser. For sustained or high-volume use, route requests through a backend and respect each service's usage policies.
