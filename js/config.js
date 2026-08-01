/* GoTime 設定 —— 唯一需要填金鑰的地方 */
const CONFIG = {
  // 中央氣象署開放資料平臺授權碼（免費申請；公開網站上為公開資訊，僅作為流量識別用）
  CWA_API_KEY: 'CWA-1C612B62-55A2-4D86-B61D-630487CE3B0B',
  CWA_BASE: 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/',

  // 預設位置：臺灣地理中心碑（南投縣埔里鎮）
  DEFAULT_LAT: 23.9739,
  DEFAULT_LON: 120.9773,
  DEFAULT_ZOOM: 8,

  // 地圖可視範圍限制在台灣（含澎湖 119.3、金門 118.2、馬祖 26.4、蘭嶼綠島 121.6）
  BOUNDS: [[21.5, 118.0], [26.5, 122.5]],
  MIN_ZOOM: 7,

  TZ: 'Asia/Taipei',
};
