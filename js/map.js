/* Leaflet 地圖：點選取點，可視範圍限制在台灣；雷達回波疊圖 */

const GMap = (function () {
  let map = null, marker = null, onPick = null,
    radarLayer = null, stationLayer = null, typhoonLayer = null;

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

  /** 最近的自動氣象站：紅點＋站名／鄉鎮／觀測時間 */
  function setStation(st) {
    clearStation();
    if (!st) return;
    stationLayer = L.circleMarker([st.lat, st.lon], {
      radius: 7, color: '#fff', weight: 2,
      fillColor: '#d93025', fillOpacity: 1,
    }).bindTooltip(`氣象站：${st.name}`, { direction: 'top', offset: [0, -6] })
      .bindPopup(
        `<b>氣象站：${st.name}</b><br>${st.county}${st.town}`
        + `<br>觀測時間 ${st.time.slice(0, 16).replace('T', ' ')}`
        + (st.alt !== null ? `<br>海拔 ${Math.round(st.alt)} m` : '')
        + `<br>距選取位置 ${st.dist.toFixed(1)} km`
      );
    stationLayer.addTo(map);
  }

  function clearStation() {
    if (stationLayer) { map.removeLayer(stationLayer); stationLayer = null; }
  }

  /* ---------------- 颱風路徑 ---------------- */

  const R_EARTH = 6371;

  /** 由中心點沿方位角 brng（度）前進 d 公里後的座標 */
  function destPoint(lat, lon, d, brng) {
    const D = Math.PI / 180, r = d / R_EARTH;
    const p1 = lat * D, l1 = lon * D, b = brng * D;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(r) + Math.cos(p1) * Math.sin(r) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(r) * Math.cos(p1),
      Math.cos(r) - Math.sin(p1) * Math.sin(p2));
    return [p2 / D, l2 / D];
  }

  /**
   * 暴風圈環：有四象限半徑時畫成不對稱形狀（比正圓貼近實際風場），否則畫正圓。
   * 象限半徑代表該象限的最大值，相鄰象限間以線性內插銜接。
   */
  function stormRing(lat, lon, radius, quad) {
    const pts = [];
    for (let b = 0; b < 360; b += 5) {
      let r = radius;
      if (quad) {
        // NE=45°, SE=135°, SW=225°, NW=315° 為各象限中心方位
        const centers = [[45, 'NE'], [135, 'SE'], [225, 'SW'], [315, 'NW']];
        let a = null, bnd = null;
        for (let i = 0; i < 4; i++) {
          const c0 = centers[i], c1 = centers[(i + 1) % 4];
          let d0 = c0[0], d1 = c1[0] < c0[0] ? c1[0] + 360 : c1[0];
          let bb = b < d0 ? b + 360 : b;
          if (bb >= d0 && bb <= d1) { a = [c0[1], d0]; bnd = [c1[1], d1, bb]; break; }
        }
        if (a && bnd && quad[a[0]] != null && quad[bnd[0]] != null) {
          const t = (bnd[2] - a[1]) / (bnd[1] - a[1]);
          r = quad[a[0]] * (1 - t) + quad[bnd[0]] * t;
        }
      }
      pts.push(destPoint(lat, lon, r, b));
    }
    pts.push(pts[0]);
    return pts;
  }

  /** 畫出颱風的過去路徑、預報路徑、暴風圈與 70% 機率圈 */
  function setTyphoon(c) {
    clearTyphoon();
    if (!c || !c.now) return;
    typhoonLayer = L.layerGroup();
    const add = (x) => x.addTo(typhoonLayer);

    // 過去路徑（實線）
    const pastPts = c.past.filter((f) => f.lat !== null).map((f) => [f.lat, f.lon]);
    if (pastPts.length > 1) {
      add(L.polyline(pastPts, { color: '#5f6368', weight: 2, opacity: .8 }));
    }
    // 預報路徑（虛線）
    const forePts = c.forecast.filter((f) => f.lat !== null).map((f) => [f.lat, f.lon]);
    if (forePts.length) {
      add(L.polyline([[c.now.lat, c.now.lon]].concat(forePts),
        { color: '#d93025', weight: 2.5, dashArray: '7 6' }));
    }

    // 70% 機率圈（預報誤差，先畫在底層）
    for (const f of c.forecast) {
      if (f.lat === null || !f.r70) continue;
      add(L.circle([f.lat, f.lon], { radius: f.r70 * 1000, color: '#d93025', weight: 1,
        opacity: .45, fillColor: '#d93025', fillOpacity: .05 }));
    }

    // 目前暴風圈：七級風（外）與十級風（內）
    if (c.now.r15) {
      add(L.polygon(stormRing(c.now.lat, c.now.lon, c.now.r15, c.now.quad15),
        { color: '#e37400', weight: 2, fillColor: '#e37400', fillOpacity: .12 }));
    }
    if (c.now.r25) {
      add(L.polygon(stormRing(c.now.lat, c.now.lon, c.now.r25, null),
        { color: '#d93025', weight: 2, fillColor: '#d93025', fillOpacity: .18 }));
    }

    // 預報點標記
    for (const f of c.forecast) {
      if (f.lat === null) continue;
      add(L.circleMarker([f.lat, f.lon], { radius: 4, color: '#fff', weight: 1.5,
        fillColor: '#d93025', fillOpacity: 1 })
        .bindTooltip(`${f.hour} 小時後`, { direction: 'top', offset: [0, -4] })
        .bindPopup(`<b>${c.name}　${f.hour} 小時後</b><br>`
          + `中心 ${f.lat}N ${f.lon}E<br>`
          + (f.wind ? `近中心最大風速 ${f.wind} m/s<br>` : '')
          + (f.pressure ? `中心氣壓 ${f.pressure} hPa<br>` : '')
          + (f.r15 ? `七級風暴風半徑 ${f.r15} km<br>` : '')
          + (f.r70 ? `70% 機率半徑 ${f.r70} km` : '')));
    }

    // 颱風中心
    add(L.marker([c.now.lat, c.now.lon], { icon: TYPHOON_ICON, zIndexOffset: 500 })
      .bindTooltip(`${c.grade} ${c.name}`, { direction: 'top', offset: [0, -12], permanent: false })
      .bindPopup(`<b>${c.grade}　${c.name}</b>（${c.intlName}）<br>`
        + `中心 ${c.now.lat}N ${c.now.lon}E<br>`
        + (c.now.pressure ? `中心氣壓 ${c.now.pressure} hPa<br>` : '')
        + (c.now.wind ? `近中心最大風速 ${c.now.wind} m/s（陣風 ${c.now.gust || '—'}）<br>` : '')
        + (c.now.movePred ? c.now.movePred : '')));

    typhoonLayer.addTo(map);
  }

  const TYPHOON_ICON = L.divIcon({
    className: 'ty-pin',
    html: '<svg viewBox="0 0 24 24" width="26" height="26"><circle cx="12" cy="12" r="11" fill="#d93025" opacity=".22"/>'
      + '<path d="M12 3c4 2 5 6 2 8 3-1 5 2 4 5-2-4-6-3-8-1-2 2-6 1-7-2 3 2 5-1 4-4 3 1 5-3 5-6z" fill="#d93025"/>'
      + '<circle cx="12" cy="12" r="1.8" fill="#fff"/></svg>',
    iconSize: [26, 26], iconAnchor: [13, 13],
  });

  function clearTyphoon() {
    if (typhoonLayer) { map.removeLayer(typhoonLayer); typhoonLayer = null; }
  }

  /** 把地圖縮放到涵蓋颱風與目前位置 */
  function fitTyphoon(c) {
    if (!c || !c.now || !map) return;
    const pts = [[c.now.lat, c.now.lon], marker.getLatLng()]
      .concat(c.forecast.filter((f) => f.lat !== null).map((f) => [f.lat, f.lon]));
    map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 8 });
  }

  return {
    init, setMarker, setRadar, clearRadar, setStation, clearStation,
    setTyphoon, clearTyphoon, fitTyphoon,
    get instance() { return map; },
  };
})();
