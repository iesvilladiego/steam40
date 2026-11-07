/* ====================================================================
 * Service Worker — Evidencias STEAM4.0 | PROYECTO STEAM VILLADIEGO
 * Alojamiento: https://iesvilladiego.github.io/steam40/
 * --------------------------------------------------------------------
 *
 * ÁMBITO LIMITADO A /steam40/ (NO interfiere con el portal superior)
 * --------------------------------------------------------------------
 * Este archivo se sirve desde /steam40/sw.js y se registra desde
 * index.html con scope "./" (=> https://iesvilladiego.github.io/steam40/).
 * El navegador solo permite a un Service Worker controlar páginas cuyo
 * URL esté dentro de su ámbito, por lo que este SW:
 *
 *   1. NUNCA controla el portal https://iesvilladiego.github.io/ ni
 *      ningún otro subdirectorio: no puede cachearlos, interceptarlos
 *      ni modificar sus respuestas.
 *   2. NO se registra en el ámbito raíz del portal: su registro vive
 *      únicamente en /steam40/ y su ciclo de vida (install / activate /
 *      update) es independiente del Service Worker del portal, si lo
 *      tuviera. Desinstalar o actualizar esta app no afecta al portal.
 *   3. En el manejador "fetch" se descarta de forma explícita cualquier
 *      petición que no pertenezca a /steam40/ o a los CDN que usa esta
 *      app, dejándola en manos de la red o del SW del portal.
 *
 * La app ya no usa OAuth ni las APIs de Google Drive: el docente descarga
 * el PDF generado y lo sube manualmente a la carpeta compartida del IES
 * (drive.google.com se deja pasar siempre por la red, sin caché).
 *
 * ESTRATEGIAS DE CACHÉ
 * --------------------------------------------------------------------
 *  - Navegación en /steam40/ ........ red primero (con límite de tiempo),
 *                                     respaldo en caché y página offline.
 *  - Recursos propios (iconos, etc.) . caché primero.
 *  - CDN (Tailwind, Font Awesome,
 *    jsPDF, Google Fonts) ............ stale-while-revalidate: la app
 *                                     funciona sin conexión tras la 1ª visita.
 *  - drive.google.com, Apps Script . solo red, sin caché.
 *  - Todo lo demás ................... no se intercepta.
 *
 * Al publicar una nueva versión de la app, incrementa VERSION para que
 * las cachés antiguas se eliminen y los clientes se actualicen.
 * ==================================================================== */

'use strict';

const VERSION = 'v1.4.2';
const CACHE_NAME = 'steam40-evidencias-' + VERSION;
const TIEMPO_LIMITE_NAV = 5000; // ms: máx. espera de red en navegaciones

// Ámbito real de esta app (p. ej. https://iesvilladiego.github.io/steam40/)
const SCOPE = new URL(self.registration.scope);

// Recursos propios (mismo origen, dentro de /steam40/) que forman la app.
// Las URLs relativas se resuelven contra /steam40/sw.js.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/favicon-16x16.png',
  './icons/favicon-32x32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/icon-maskable-192x192.png',
  './icons/icon-maskable-512x512.png'
];

// CDNs de los que depende la app (se cachean al usarse por primera vez).
const HOSTS_CDN = [
  'cdn.tailwindcss.com',   // Tailwind CSS (Play CDN)
  'cdnjs.cloudflare.com',  // Font Awesome y jsPDF
  'fonts.googleapis.com',  // CSS de Google Fonts
  'fonts.gstatic.com'      // Ficheros woff2 de Google Fonts
];

// Servicios de Google usados por la app para la entrega de evidencias
// (carpeta compartida y servicio de subida de Apps Script): nunca se
// interceptan. Las peticiones de envío son POST y este SW solo gestiona
// GET, pero se dejan documentadas por si cambia la estrategia.
const HOSTS_SOLO_RED = [
  'drive.google.com',             // Carpeta compartida del proyecto
  'script.google.com',            // Aplicación web de Apps Script (envío PDF)
  'script.googleusercontent.com'  // Respuesta final de Apps Script (redirect)
];

/* ------------------------------------------------------------------
 * Utilidades
 * ------------------------------------------------------------------ */

// ¿Es un recurso de esta app (mismo origen y bajo /steam40/)?
function esDeLaApp(url) {
  return url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname);
}

function esHostCdn(url) {
  return HOSTS_CDN.indexOf(url.hostname) !== -1;
}

function esSoloRed(url) {
  return HOSTS_SOLO_RED.indexOf(url.hostname) !== -1;
}

/* ------------------------------------------------------------------
 * Instalación: precaché de la carcasa de la aplicación
 * ------------------------------------------------------------------ */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Se precachean los recursos de forma tolerante: si alguno falla
    // (p. ej. sin conexión en el primer intento), la instalación sigue
    // y ese recurso se cacheará más adelante al usarse.
    await Promise.allSettled(
      APP_SHELL.map((recurso) => cache.add(new Request(recurso, { cache: 'reload' })))
    );
    // Activa esta versión en cuanto esté lista. "skipWaiting" solo
    // afecta al Service Worker de /steam40/, nunca al portal superior.
    await self.skipWaiting();
  })());
});

/* ------------------------------------------------------------------
 * Activación: limpieza de cachés obsoletas de esta misma app
 * ------------------------------------------------------------------ */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(
      claves
        .filter((clave) => clave.indexOf('steam40-evidencias-') === 0 && clave !== CACHE_NAME)
        .map((clave) => caches.delete(clave))
    );
    // "clients.claim()" solo toma el control de clientes abiertos DENTRO
    // del ámbito /steam40/; las páginas del portal superior no se tocan.
    await self.clients.claim();
  })());
});

/* ------------------------------------------------------------------
 * Mensajes desde la página (forzar la activación de una update o
 * consultar la versión instalada para el chip del encabezado)
 * ------------------------------------------------------------------ */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  // Consulta de versión: se responde por el MessageChannel que abrió la
  // página, de modo que la respuesta solo la reciba quien preguntó.
  if (event.data && event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ type: 'VERSION', version: VERSION });
  }
});

/* ------------------------------------------------------------------
 * Intercepción de peticiones
 * ------------------------------------------------------------------ */
self.addEventListener('fetch', (event) => {
  const peticion = event.request;

  // Solo se gestionan peticiones GET; el resto usa la red tal cual.
  if (peticion.method !== 'GET') return;

  let url;
  try {
    url = new URL(peticion.url);
  } catch (e) {
    return;
  }

  // 1) APIs de Google (OAuth / Drive): SIEMPRE red, sin caché.
  if (esSoloRed(url)) return;

  // 2) Navegación dentro de /steam40/: red primero con respaldo offline.
  if (peticion.mode === 'navigate' && esDeLaApp(url)) {
    event.respondWith(responderNavegacion(peticion));
    return;
  }

  // 3) Recursos estáticos de los CDN que usa la app: stale-while-revalidate.
  if (esHostCdn(url)) {
    event.respondWith(staleWhileRevalidate(peticion));
    return;
  }

  // 4) Recursos propios bajo /steam40/: caché primero.
  if (esDeLaApp(url)) {
    event.respondWith(cacheFirst(peticion));
    return;
  }

  // Cualquier otra petición (incluidas las del portal superior) NO se
  // intercepta: sigue su curso normal de red / SW del portal.
});

/* ------------------------------------------------------------------
 * Estrategias
 * ------------------------------------------------------------------ */

// Navegación: red primero con límite de tiempo; si falla o tarda
// demasiado, se sirve la copia en caché o una página offline mínima.
async function responderNavegacion(peticion) {
  const cache = await caches.open(CACHE_NAME);

  const promesaRed = fetch(peticion)
    .then((respuesta) => {
      if (respuesta && respuesta.ok) {
        // Se guarda la versión fresca del documento principal.
        cache.put('./index.html', respuesta.clone());
      }
      return respuesta;
    })
    .catch(() => null);

  const respuesta = await Promise.race([
    promesaRed,
    new Promise((resolver) => setTimeout(() => resolver(null), TIEMPO_LIMITE_NAV))
  ]);

  if (respuesta) return respuesta;

  const enCache = (await cache.match(peticion)) || (await cache.match('./index.html'));
  if (enCache) return enCache;

  return paginaSinConexion();
}

// Stale-while-revalidate: sirve la copia cacheada al instante y
// renueva la caché en segundo plano (CDNs).
async function staleWhileRevalidate(peticion) {
  const cache = await caches.open(CACHE_NAME);
  const enCache = await cache.match(peticion, { ignoreVary: true });

  const promesaRed = fetch(peticion)
    .then((respuesta) => {
      // Se guardan respuestas válidas, incluidas las opacas (no-cors)
      // de CDNs sin cabeceras CORS para lecturas posteriores.
      if (respuesta && (respuesta.ok || respuesta.type === 'opaque')) {
        cache.put(peticion, respuesta.clone());
      }
      return respuesta;
    })
    .catch(() => null);

  if (enCache) {
    return enCache; // la renovación continúa en segundo plano
  }
  const fresca = await promesaRed;
  if (fresca) return fresca;
  return new Response('', { status: 504, statusText: 'Sin conexión' });
}

// Caché primero para recursos propios (iconos, manifest, etc.).
async function cacheFirst(peticion) {
  const cache = await caches.open(CACHE_NAME);
  const enCache = await cache.match(peticion);
  if (enCache) return enCache;

  try {
    const respuesta = await fetch(peticion);
    if (respuesta && respuesta.ok) {
      cache.put(peticion, respuesta.clone());
    }
    return respuesta;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'Sin conexión' });
  }
}

// Página mínima mostrada si no hay red ni copia en caché (primera visita
// sin conexión). Mantiene la identidad visual del proyecto.
function paginaSinConexion() {
  const html =
    '<!DOCTYPE html>' +
    '<html lang="es"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Sin conexión | Evidencias STEAM4.0</title>' +
    '<style>' +
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content-center;' +
    "font-family:'Segoe UI',system-ui,sans-serif;background:#082f49;color:#fff;text-align:center;padding:24px}" +
    '.caja{max-width:420px}' +
    'h1{font-size:1.35rem;margin:0 0 12px}' +
    'p{color:#bae6fd;line-height:1.6;margin:0 0 20px}' +
    'span{display:inline-block;font-size:2.6rem;margin-bottom:12px}' +
    'button{background:#10b981;color:#fff;border:0;border-radius:10px;padding:12px 22px;' +
    'font-size:1rem;font-weight:600;cursor:pointer}' +
    '</style></head><body>' +
    '<div class="caja"><span>🤖</span>' +
    '<h1>Evidencias STEAM4.0</h1>' +
    '<p>No hay conexión a internet y la aplicación todavía no se ha guardado ' +
    'en este dispositivo. Conéctate una primera vez para poder usarla después ' +
    'sin conexión.</p>' +
    '<button onclick="location.reload()">Reintentar</button>' +
    '</div></body></html>';

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-cache' }
  });
}
