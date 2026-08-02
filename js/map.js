/* Leaflet 地圖：點選取點，可視範圍限制在台灣；雷達回波疊圖 */

const GMap = (function () {
  let map = null, marker = null, onPick = null, radarLayer = null;

  // Material red 圖釘（取代 Leaflet 預設藍色）
  const PIN = L.divIcon({
    className: 'gt-pin',
    html: '<svg viewBox="0 0 24 34" width="26" height="37" aria-hidden="true">'
      + '<path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 22 12 22s12-13.6 12-22C24 5.4 18.6 0 12 0z" '
      + 'fill="#ea4335" stroke="#fff" stroke-width="1.5"/>'
      + '<circle cx="12" cy="12" r="4.4" fill="#fff"/></svg>',
    iconSize: [26, 37],
    iconAnchor: [13, 36],
  });

  function init(lat, lon, pickHandler) {
    onPick = pickHandler;
    const bounds = L.latLngBounds(CONFIG.BOUNDS);
    map = L.map('map', {
      zoomControl: true,
      maxBounds: bounds,
      maxBoundsViscosity: 1.0,   // 拖出邊界時完全擋住
      minZoom: CONFIG.MIN_ZOOM,
      maxZoom: 18,
    }).setView([lat, lon], CONFIG.DEFAULT_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      bounds,                    // 不向邊界外要圖磚
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    marker = L.marker([lat, lon], { draggable: true, icon: PIN }).addTo(map);
    marker.on('dragend', () => {
      const p = clamp(marker.getLatLng());
      marker.setLatLng(p);
      onPick(p.lat, p.lng);
    });
    map.on('click', (e) => {
      const p = clamp(e.latlng);
      setMarker(p.lat, p.lng);
      onPick(p.lat, p.lng);
    });
    return map;
  }

  /** 把座標夾在台灣範圍內（拖曳仍可能些微越界） */
  function clamp(ll) {
    const [[s, w], [n, e]] = CONFIG.BOUNDS;
    return {
      lat: Math.min(n, Math.max(s, ll.lat)),
      lng: Math.min(e, Math.max(w, ll.lng)),
    };
  }

  function setMarker(lat, lon, pan) {
    if (!marker) return;
    marker.setLatLng([lat, lon]);
    if (pan) map.setView([lat, lon], Math.max(map.getZoom(), 12));
  }

  /** 顯示／更新雷達回波疊圖 */
  function setRadar(url, bounds, opacity) {
    clearRadar();
    if (!url) return;
    radarLayer = L.imageOverlay(url, bounds, { opacity: opacity, interactive: false });
    radarLayer.addTo(map);
  }

  function clearRadar() {
    if (radarLayer) { map.removeLayer(radarLayer); radarLayer = null; }
  }

  return {
    init, setMarker, setRadar, clearRadar,
    get instance() { return map; },
  };
})();
