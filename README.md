# GoTime｜開工吉時

生態調查用的出勤時機查詢工具。輸入或點選位置與日期，一頁看完
**日出日落、三段曙暮光、月相、潮汐、鄉鎮天氣**，並依自訂規則算出當天實際的調查時段，可匯出行事曆。

🔗 https://win-hs.github.io/gotime/

## 功能

- **太陽**：日出日落、日長、民用／航海／天文曙暮光（晨昏各三個時刻）
- **月亮**：月相圖與名稱、照度百分比、月出月落
- **潮汐**：當日滿乾潮時刻與潮高、大／中／小潮、農曆日期；可展開整月潮汐表挑大潮
- **天氣**：中央氣象署鄉鎮預報（天氣現象、溫度、降雨機率、風級、紫外線）
- **調查時段規劃**：自訂規則如「民用曙光始 −30 分 ～ 日出 +180 分」「乾潮前後各 2 小時」，
  套用當天位置直接算出實際時刻，可匯出 `.ics` 加入 Google 日曆
- **常用地點**與**分享連結**（網址帶 `?lat&lon&date`，開啟即還原畫面）

## 資料來源

| 資料 | 來源 |
|---|---|
| 日出日落、曙暮光、月相照度 | [SunCalc](https://github.com/mourner/suncalc)（本機計算） |
| 月出月落 | 自行實作，Meeus《Astronomical Algorithms》第 47 章（本機計算） |
| 潮汐、鄉鎮天氣 | [中央氣象署開放資料平臺](https://opendata.cwa.gov.tw/) |
| 地圖 | [Leaflet](https://leafletjs.com/) + OpenStreetMap |
| 地名搜尋 | [Nominatim](https://nominatim.org/) |

天文計算完全在瀏覽器本機執行，不需網路；潮汐與天氣需連線。

### 精度

對中央氣象署官方資料校驗（花蓮縣）：

- 日出、日落、民用曙暮光：誤差 **≤1 分鐘**
- 月出、月落：2026-08 整月 29 天，平均差 −0.5 分，**最大 1 分鐘**

月球位置未採用 SunCalc，因其黃經僅保留主要中心差項，升落時刻誤差可達 10 分鐘。

## 開發

純 vanilla HTML/CSS/JS，零建置、零相依套件安裝。

```bash
powershell -File serve.ps1 -Port 4325
```

開 http://localhost:4325 即可。

### 檔案

```
index.html
css/app.css
js/config.js     氣象署授權碼與預設值
js/moonpos.js    月球位置（Meeus ch.47）
js/astro.js      日月時刻、月相、SVG 月相圖
js/geo.js        最近鄉鎮／潮汐點、地名搜尋
js/cwa.js        氣象署 API（唯一對外資料模組）
js/plan.js       調查規則引擎與 .ics 產生
js/map.js        Leaflet
js/app.js        狀態、渲染、常用地點、分享
data/towns.json        368 鄉鎮座標與所屬資料集代碼
data/tide-points.json  266 潮汐預報點（含漁港、海水浴場、潛點等）
```

### 氣象署授權碼

`js/config.js` 內含一組免費申請的授權碼。氣象署開放資料平臺免費且無計費，
公開於前端的風險僅止於遭大量濫用時可能被限流；若需更換，
到 [opendata.cwa.gov.tw](https://opendata.cwa.gov.tw/) 會員頁重新產生後替換即可。

## 授權

程式碼 MIT。氣象資料著作權屬中央氣象署，依其開放資料條款使用。
