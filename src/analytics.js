// Google Analytics (GA4) for the web layer — loads gtag.js lazily and
// fails silently offline. The native Android layer also ships the Firebase
// Analytics SDK for automatic app/session events; these are the gameplay ones.

const MEASUREMENT_ID = "G-ZBGDTRZFD7";
let ready = false;

export function initAnalytics(gameUid) {
  try {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", MEASUREMENT_ID, {
      send_page_view: false,
      user_id: gameUid || undefined,
    });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    script.onerror = () => { ready = false; };
    document.head.append(script);
    ready = true;
  } catch {
    ready = false;
  }
}

export function track(eventName, params = {}) {
  if (!ready || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", eventName, params);
  } catch {
    // analytics must never break gameplay
  }
}
