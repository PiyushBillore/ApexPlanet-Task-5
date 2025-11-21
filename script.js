const API_KEY = "edd1e5d712b86b8d9bba3972d46d4d06";

// DOM elems
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const geoBtn = document.getElementById("geoBtn");
const message = document.getElementById("message");

const currentCard = document.getElementById("currentCard");
const cityNameEl = document.getElementById("cityName");
const dateTimeEl = document.getElementById("dateTime");
const weatherIconEl = document.getElementById("weatherIcon");
const descriptionEl = document.getElementById("description");
const tempEl = document.getElementById("temp");
const feelsEl = document.getElementById("feels");
const humidityEl = document.getElementById("humidity");
const windEl = document.getElementById("wind");
const pressureEl = document.getElementById("pressure");
const visibilityEl = document.getElementById("visibility");
const cloudsEl = document.getElementById("clouds");
const sunriseEl = document.getElementById("sunrise");
const sunsetEl = document.getElementById("sunset");

const forecastSection = document.getElementById("forecast");
const forecastCards = document.getElementById("forecastCards");
const recentList = document.getElementById("recentList");
const mapSection = document.getElementById("mapSection");
const overlayToggle = document.getElementById("overlayToggle");
const unitToggle = document.getElementById("unitToggle");
const unitLabel = document.getElementById("unitLabel");
const unitLabel2 = document.getElementById("unitLabel2");

// const aqiEl = document.getElementById('aqi'); // REMOVED
// const aqiText = document.getElementById('aqiText'); // REMOVED
// const aqComponents = document.getElementById('aqComponents'); // REMOVED
const clearRecent = document.getElementById("clearRecent");

let recentSearches = JSON.parse(
  localStorage.getItem("recentWeatherSearches") || "[]"
);

// Units: 'metric' (C) or 'imperial' (F)
let units = "metric";

// Leaflet map & overlay
let map = null;
let mapMarker = null;
let tempOverlay = null;

// -----------------------------
// Time helpers (city-local using tz offset seconds)
// -----------------------------
function formatDateStrWithTZ(unixTs, tzOffsetSeconds = 0) {
  if (unixTs === undefined || unixTs === null) return "";
  const d = new Date((unixTs + (tzOffsetSeconds || 0)) * 1000); // format using UTC to avoid client's timezone shifting
  const options = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  };
  return new Intl.DateTimeFormat(undefined, options).format(
    new Date(d.toUTCString())
  );
}
function toLocalTimeString(unixTs, tzOffsetSeconds = 0) {
  if (unixTs === undefined || unixTs === null) return "";
  const d = new Date((unixTs + (tzOffsetSeconds || 0)) * 1000);
  const hh = d.getUTCHours().toString().padStart(2, "0");
  const mm = d.getUTCMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}
function getDayNameWithTZ(unixTs, tzOffsetSeconds = 0) {
  if (unixTs === undefined || unixTs === null) return "";
  const d = new Date((unixTs + (tzOffsetSeconds || 0)) * 1000);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(d.toUTCString()));
}
function formatDateStr(unixTs) {
  return formatDateStrWithTZ(unixTs, 0);
} // fallback

// -----------------------------
// UI helpers
// -----------------------------
function showMessage(txt, isError = false) {
  if (!message) return;
  message.textContent = txt;
  message.style.color = isError ? "#ffbaba" : "";
}
function clearMessage() {
  if (message) {
    message.textContent = "";
    message.style.color = "";
  }
}

function saveRecent(city) {
  if (!city) return;
  city = city.trim();
  recentSearches = recentSearches.filter(
    (c) => c.toLowerCase() !== city.toLowerCase()
  );
  recentSearches.unshift(city);
  if (recentSearches.length > 8) recentSearches.pop();
  localStorage.setItem("recentWeatherSearches", JSON.stringify(recentSearches));
  renderRecent();
}
function renderRecent() {
  recentList.innerHTML = "";
  if (recentSearches.length === 0) {
    recentList.innerHTML = '<p class="muted">No recent searches</p>';
    return;
  }
  recentSearches.forEach((city) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.textContent = city;
    btn.addEventListener("click", () => performSearch(city));
    li.appendChild(btn);
    recentList.appendChild(li);
  });
}
if (clearRecent)
  clearRecent.addEventListener("click", () => {
    recentSearches = [];
    localStorage.removeItem("recentWeatherSearches");
    renderRecent();
  });

// -----------------------------
// Map & overlay
// -----------------------------
function initMap() {
  if (typeof L === "undefined") {
    console.warn("Leaflet missing");
    return;
  }
  if (!map) {
    map = L.map("map", {
      center: [20.5937, 78.9629],
      zoom: 4,
      preferCanvas: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    mapMarker = L.marker([20.5937, 78.9629]).addTo(map);
  }
}
function addTempOverlay() {
  if (!map) return;
  removeTempOverlay();
  const url = `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${API_KEY}`;
  tempOverlay = L.tileLayer(url, {
    opacity: 0.5,
    maxZoom: 12,
    attribution: "&copy; OpenWeather",
  }).addTo(map);
}
function removeTempOverlay() {
  if (tempOverlay && map) {
    map.removeLayer(tempOverlay);
    tempOverlay = null;
  }
}
function updateMap(lat, lon) {
  initMap();
  if (!map) return;
  mapSection && mapSection.classList.remove("hidden");
  map.setView([lat, lon], 10);
  if (mapMarker) mapMarker.setLatLng([lat, lon]);
  else mapMarker = L.marker([lat, lon]).addTo(map);
}

// -----------------------------
// Core: search / fetch
// -----------------------------
async function performSearch(query) {
  clearMessage();
  if (!query || !query.trim()) {
    showMessage("Please enter a city name.", true);
    return;
  }
  currentCard.classList.add("hidden");
  forecastSection.classList.add("hidden");
  mapSection.classList.add("hidden");
  showMessage("Loading...");
  try {
    const q = encodeURIComponent(query.trim());
    const curUrl = `https://api.openweathermap.org/data/2.5/weather?q=${q}&units=${units}&appid=${API_KEY}`;
    const curRes = await fetch(curUrl);
    if (!curRes.ok) {
      if (curRes.status === 401) throw new Error("Invalid API key (401).");
      if (curRes.status === 404) throw new Error("City not found (404).");
      throw new Error(`Weather API ${curRes.status}`);
    }
    const cur = await curRes.json();
    const tz = cur.timezone || 0;
    displayCurrent(cur, tz);
    saveRecent(cur.name);

    const lat = cur.coord?.lat;
    const lon = cur.coord?.lon;
    if (typeof lat === "number" && typeof lon === "number") {
      await fetchForecast(lat, lon, tz); // await fetchAirPollution(lat, lon); // REMOVED
      updateMap(lat, lon);
      if (overlayToggle && overlayToggle.checked) addTempOverlay();
      else removeTempOverlay();
    }
    clearMessage();
    if (searchInput) searchInput.value = "";
  } catch (err) {
    console.error(err);
    showMessage("Error: " + (err.message || "Something went wrong"), true);
  }
}

async function fetchByCoords(lat, lon) {
  clearMessage();
  showMessage("Loading...");
  try {
    const curUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;
    const curRes = await fetch(curUrl);
    if (!curRes.ok) throw new Error("Weather fetch error: " + curRes.status);
    const cur = await curRes.json();
    const tz = cur.timezone || 0;
    displayCurrent(cur, tz);
    saveRecent(cur.name);
    await fetchForecast(lat, lon, tz); // await fetchAirPollution(lat, lon); // REMOVED
    updateMap(lat, lon);
    if (overlayToggle && overlayToggle.checked) addTempOverlay();
    else removeTempOverlay();
    clearMessage();
  } catch (err) {
    console.error(err);
    showMessage(
      "Error: " + (err.message || "Unable to fetch weather for your location"),
      true
    );
  }
} // -----------------------------

// -----------------------------
// Display current (uses tz)
function displayCurrent(data, tz = 0) {
  try {
    const { name, dt, main, weather, wind, visibility, clouds, sys } = data;
    cityNameEl.textContent = `${name}${sys?.country ? ", " + sys.country : ""}`;
    dateTimeEl.textContent = formatDateStrWithTZ(dt, tz);
    const icon = weather?.[0]?.icon;
    if (weatherIconEl) {
      weatherIconEl.src = icon
        ? `https://openweathermap.org/img/wn/${icon}@2x.png`
        : "";
      weatherIconEl.alt = weather?.[0]?.description || "Weather";
    }
    descriptionEl.textContent = capitalize(weather?.[0]?.description || "");
    tempEl.textContent = main?.temp ? Math.round(main.temp) : "";
    feelsEl.textContent = main?.feels_like ? Math.round(main.feels_like) : "";
    humidityEl.textContent = main?.humidity ?? "";
    windEl.textContent = wind?.speed ?? "";
    pressureEl.textContent = main?.pressure ?? "";
    visibilityEl.textContent = visibility
      ? Math.round(visibility / 100) / 10
      : ""; // km with 1 decimal
    cloudsEl.textContent = clouds?.all ?? "";
    sunriseEl.textContent = toLocalTimeString(sys?.sunrise, tz);
    sunsetEl.textContent = toLocalTimeString(sys?.sunset, tz);
    currentCard.classList.remove("hidden");

    unitLabel.textContent = units === "metric" ? "°C" : "°F";
    unitLabel2.textContent = units === "metric" ? "°C" : "°F";
  } catch (err) {
    console.error("displayCurrent error", err);
  }
}

// -----------------------------
// Forecast
// -----------------------------
async function fetchForecast(lat, lon, tz = 0) {
  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Forecast fetch failed: " + res.status);
    const data = await res.json();
    const daily = aggregateDaily(data.list);
    renderForecast(daily, tz);
  } catch (err) {
    console.error(err);
    showMessage("Error fetching forecast: " + (err.message || ""), true);
  }
}
function aggregateDaily(list) {
  const map = {};
  list.forEach((item) => {
    const d = new Date(item.dt * 1000);
    const key = d.toISOString().split("T")[0];
    if (!map[key]) map[key] = [];
    map[key].push(item);
  });
  const days = Object.keys(map).slice(0, 6);
  const result = [];
  for (const key of days) {
    const items = map[key];
    const chosen = items.reduce((best, cur) => {
      const curH = new Date(cur.dt * 1000).getHours();
      const bestH = new Date(best.dt * 1000).getHours();
      return Math.abs(curH - 12) < Math.abs(bestH - 12) ? cur : best;
    }, items[0]);
    result.push(chosen);
  }
  return result.slice(0, 5);
}
function renderForecast(arr, tz = 0) {
  forecastCards.innerHTML = "";
  arr.forEach((item) => {
    const icon = item.weather?.[0]?.icon;
    const card = document.createElement("div");
    card.className = "forecast-card card";
    card.innerHTML = `
   <div class="muted">${getDayNameWithTZ(item.dt, tz)}</div>
   <img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${
      item.weather?.[0]?.description || ""
    }" />
   <div class="muted">${capitalize(item.weather?.[0]?.description || "")}</div>
   <div><strong>${Math.round(item.main?.temp ?? "")}${
      units === "metric" ? "°C" : "°F"
    }</strong></div>
   <div class="muted">H:${Math.round(item.main?.temp_max ?? "")} L:${Math.round(
      item.main?.temp_min ?? ""
    )}</div>
  `;
    forecastCards.appendChild(card);
  });
  forecastSection.classList.remove("hidden");
}

// -----------------------------
// Helpers
// -----------------------------
function getDayName(unixTs) {
  return getDayNameWithTZ(unixTs, 0);
} // fallback
function capitalize(s = "") {
  return String(s)
    .split(" ")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

// -----------------------------
// Event listeners
// -----------------------------
if (searchBtn)
  searchBtn.addEventListener("click", () => performSearch(searchInput?.value));
if (searchInput)
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") performSearch(searchInput.value);
  });
if (geoBtn)
  geoBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showMessage("Geolocation not supported", true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchByCoords(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        showMessage("Unable to retrieve location", true);
      },
      { timeout: 10000 }
    );
  });
if (overlayToggle)
  overlayToggle.addEventListener("change", () => {
    if (overlayToggle.checked) addTempOverlay();
    else removeTempOverlay();
  });
if (unitToggle)
  unitToggle.addEventListener("change", () => {
    units = unitToggle.checked ? "imperial" : "metric"; // checked => F
    const last = recentSearches[0];
    if (last) performSearch(last);
  });

// -----------------------------
// Init
// -----------------------------
function init() {
  renderRecent();
  initMap();
  const last = recentSearches[0];
  if (last) setTimeout(() => performSearch(last), 200);
}
init();
