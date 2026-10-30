import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LoaderCircle, LocateFixed, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// OpenStreetMap tiles and Nominatim search: free, no API key.
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const pinIcon = L.divIcon({
  className: 'map-pin',
  html: '<span class="map-pin__body"><span class="map-pin__dot"></span></span>',
  iconSize: [34, 44],
  iconAnchor: [17, 42],
});

/**
 * Office location picker: drag the pin or click the map to move it. The
 * geofence radius is drawn as a circle. Calls onChange({ latitude, longitude }).
 */
export function MapPicker({ latitude, longitude, radius, onChange, onAddress }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: true }).setView([latitude, longitude], 17);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    const circle = L.circle([latitude, longitude], {
      radius,
      color: '#0f9d69',
      weight: 2,
      fillColor: '#0f9d69',
      fillOpacity: 0.15,
      dashArray: '6 6',
    }).addTo(map);
    const marker = L.marker([latitude, longitude], { draggable: true, icon: pinIcon, keyboard: true, title: 'Office location' }).addTo(map);

    const move = ({ lat, lng }) => onChangeRef.current({ latitude: round(lat), longitude: round(lng) });
    marker.on('drag', (e) => circle.setLatLng(e.target.getLatLng()));
    marker.on('dragend', (e) => move(e.target.getLatLng()));
    map.on('click', (e) => move(e.latlng));

    map.fitBounds(circle.getBounds(), { padding: [40, 40], maxZoom: 18 });
    mapRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;
    // The map may mount inside a tab that was hidden; recompute its size once visible.
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(containerRef.current);
    return () => {
      resize.disconnect();
      map.remove();
    };
    // Created once; position and radius updates are applied by the effect below.
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const point = L.latLng(latitude, longitude);
    markerRef.current.setLatLng(point);
    circleRef.current.setLatLng(point);
    circleRef.current.setRadius(radius);
    if (!mapRef.current.getBounds().contains(circleRef.current.getBounds())) {
      mapRef.current.fitBounds(circleRef.current.getBounds(), { padding: [40, 40], maxZoom: 18 });
    }
  }, [latitude, longitude, radius]);

  return (
    <div className="map-picker">
      <MapSearch
        onPick={(place) => {
          onChangeRef.current({ latitude: round(place.lat), longitude: round(place.lon) });
          onAddress?.(place.display_name);
          mapRef.current?.setView([place.lat, place.lon], 17);
        }}
        onLocate={(coords) => {
          onChangeRef.current(coords);
          mapRef.current?.setView([coords.latitude, coords.longitude], 18);
        }}
      />
      <div ref={containerRef} className="map-picker__map" role="application" aria-label="Map: drag the pin or click to set the office location" />
      <p className="map-picker__hint">Drag the pin or click anywhere on the map to move the office location.</p>
    </div>
  );
}

const round = (n) => Math.round(Number(n) * 1e6) / 1e6;

function MapSearch({ onPick, onLocate }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function search(event) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(query.trim())}`;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error();
      const places = await response.json();
      setResults(places);
      if (places.length === 0) setError('No places found. Try a more specific address.');
    } catch {
      setError('Address search is unavailable right now. Drag the pin instead.');
    } finally {
      setBusy(false);
    }
  }

  function locate() {
    setError(null);
    if (!navigator.geolocation) {
      setError('This browser cannot share its location.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setBusy(false);
        onLocate({ latitude: round(coords.latitude), longitude: round(coords.longitude) });
      },
      () => {
        setBusy(false);
        setError('Could not get your location. Allow location access and try again.');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <div className="map-search">
      <form className="map-search__form" onSubmit={search} role="search">
        <label className="search">
          <Search aria-hidden="true" />
          <span className="visually-hidden">Search for an address</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search address or place…" />
        </label>
        <button type="submit" className="btn btn--secondary" disabled={busy}>
          {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : 'Search'}
        </button>
        <button type="button" className="btn btn--secondary" onClick={locate} disabled={busy} title="Use my current location">
          <LocateFixed aria-hidden="true" /> My location
        </button>
      </form>
      {error && <p className="field-error">{error}</p>}
      {results?.length > 0 && (
        <ul className="map-results">
          {results.map((place) => (
            <li key={place.place_id}>
              <button
                type="button"
                onClick={() => {
                  onPick(place);
                  setResults(null);
                }}
              >
                {place.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
