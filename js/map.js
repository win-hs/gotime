/* Leaflet 地圖：點選取點 */

const GMap = (function () {
  let map = null, marker = null, onPick = null;

  function init(lat, lon, pickHandler) {
    onPick = pickHandler;
    map = L.map('map', { zoomControl: true }).setView([lat, lon], CONFIG.DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    marker = L.marker([lat, lon], { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      onPick(p.lat, p.lng);
    });
    map.on('click', (e) => {
      setMarker(e.latlng.lat, e.latlng.lng);
      onPick(e.latlng.lat, e.latlng.lng);
    });
    return map;
  }

  function setMarker(lat, lon, pan) {
    if (!marker) return;
    marker.setLatLng([lat, lon]);
    if (pan) map.setView([lat, lon], Math.max(map.getZoom(), 12));
  }

  return { init, setMarker };
})();
