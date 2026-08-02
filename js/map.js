/* Leaflet 地圖：點選取點，可視範圍限制在台灣；雷達回波疊圖 */

const GMap = (function () {
  let map = null, marker = null, onPick = null, radarLayer = null, rainLayer = null;

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

    marker = L.marker([lat, lon], { draggable: true }).addTo(map);
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

  /** 雨量站標記：最近的一站用紅色，其餘藍色 */
  function setRainStations(stations) {
    clearRainStations();
    if (!stations || !stations.length) return;
    rainLayer = L.layerGroup();
    stations.forEach((s, i) => {
      const near = i === 0;
      L.circleMarker([s.lat, s.lon], {
        radius: near ? 7 : 5,
        color: '#fff', weight: 2,
        fillColor: near ? '#d93025' : '#1a73e8',
        fillOpacity: 1,
      }).bindPopup(
        `<b>${s.name}</b><br>${s.town}・${s.dist.toFixed(1)} km`
        + `<br>1 小時 ${s.h1 === null ? '—' : s.h1.toFixed(1)} mm`
        + `　24 小時 ${s.h24 === null ? '—' : s.h24.toFixed(1)} mm`
      ).addTo(rainLayer);
    });
    rainLayer.addTo(map);
  }

  function clearRainStations() {
    if (rainLayer) { map.removeLayer(rainLayer); rainLayer = null; }
  }

  return {
    init, setMarker, setRadar, clearRadar, setRainStations, clearRainStations,
    get instance() { return map; },
  };
})();
