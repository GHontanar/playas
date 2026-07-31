/**
 * Worker de Cloudflare — proxy para el estado de las playas de Mojácar.
 *
 * Por qué existe: el endpoint del proveedor NO devuelve una imagen, devuelve un
 * fragmento de HTML (`content-type: text/html`) con la imagen dentro:
 *
 *     <img src="https://www.gestiondeplayas.com/mojacar/api/images/banner-mini-amarilla.gif" ...>
 *
 * Un navegador que abre esa URL lo parsea y va a buscar el GIF; un `<img src=...>`
 * apuntando ahí no puede hacerlo, recibe texto donde espera bytes y falla. Este
 * Worker da ese segundo paso desde el servidor: pide el fragmento, extrae el `src`
 * y reexpone los bytes del GIF con CORS abierto. Tampoco hay CORS en el proveedor,
 * así que este salto es obligatorio, no una optimización.
 *
 * El evento `fecha` no es una imagen ni en origen (devuelve un `<span>` con la
 * marca de tiempo), así que se sirve como SVG para que quepa en el mismo `<img>`.
 *
 * Uso desde la página:
 *   /api/banner?playa=01&evento=bandera        (como Pages Function, ver functions/)
 *   https://TU-WORKER.workers.dev/?playa=01&evento=bandera   (como Worker suelto)
 * Eventos válidos: bandera | medusas | fecha
 *
 * Despliegue como Worker suelto:
 *   npx wrangler deploy      (desde worker/, usa worker/wrangler.toml)
 *
 * Diagnóstico: la respuesta lleva X-Upstream-Status con el código HTTP real del
 * proveedor y X-Banner-Src con la URL del GIF que se acabó sirviendo.
 */

const KEY = "jhJJhg53435HJjjh255l"; // clave pública, embebida también en mojacar.es
const ALLOWED_PLAYAS = ["01", "04", "05", "07", "09", "12", "13"];
const ALLOWED_EVENTOS = ["bandera", "medusas", "fecha"];
const ALLOWED_TAMANOS = ["mini", "normal", "grande"];
const UPSTREAM_HOST = "www.gestiondeplayas.com";
const SPOOF_REFERER = "https://www.mojacar.es/mojacar-disfruta/estado-de-las-playas/";
const BEACH_IDS = {
  "01": "marina-de-la-torre",
  "04": "descargador",
  "05": "piedra-villazar",
  "07": "el-cantal",
  "09": "lance-nuevo",
  "12": "ventanicas",
  "13": "venta-del-bancal",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Preflight CORS (por si algún día haces fetch() en vez de <img>)
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }
    if (url.pathname.endsWith("/api/status")) {
      return observedStatus();
    }

    const playa = url.searchParams.get("playa");
    const evento = url.searchParams.get("evento") || "bandera";
    const tamano = url.searchParams.get("tamano") || "mini";

    // Validación: evita convertir esto en un proxy abierto
    if (!ALLOWED_PLAYAS.includes(playa) || !ALLOWED_EVENTOS.includes(evento) ||
        !ALLOWED_TAMANOS.includes(tamano)) {
      return fail(400, "Parámetros no válidos." +
        ` playa ∈ {${ALLOWED_PLAYAS.join(",")}},` +
        ` evento ∈ {${ALLOWED_EVENTOS.join(",")}},` +
        ` tamano ∈ {${ALLOWED_TAMANOS.join(",")}}`);
    }

    const upstream = `https://${UPSTREAM_HOST}/api/` +
      `?localidad=mojacar&playa=${playa}&evento=${evento}` +
      `&tipo=banner&tamano=${tamano}&clave_api=${KEY}`;

    // Paso 1: el fragmento de HTML con el estado del día.
    let frag, fragStatus;
    try {
      const r = await fetch(upstream, {
        headers: {
          "Referer": SPOOF_REFERER,
          "User-Agent": "Mozilla/5.0 (proxy-playas-mojacar)",
          "Accept": "text/html,image/*,*/*;q=0.8",
        },
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      fragStatus = r.status;
      frag = await r.text();
    } catch (e) {
      return fail(502, "Upstream no alcanzable: " + e.message);
    }

    if (fragStatus !== 200) {
      return fail(502, `El proveedor respondió ${fragStatus}: ${frag.slice(0, 200)}`,
        { "X-Upstream-Status": String(fragStatus) });
    }

    // `fecha` llega como <span>30-07-2026 11:05</span>: se pinta como SVG.
    if (evento === "fecha") {
      return svgText(stripTags(frag), fragStatus);
    }

    // Paso 2: seguir el src del <img> del fragmento.
    const src = (frag.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1];
    if (!src) {
      return fail(502, `Sin <img> en la respuesta del proveedor: ${frag.slice(0, 200)}`,
        { "X-Upstream-Status": String(fragStatus) });
    }

    // "Sin medusas" lo codifica el proveedor como banner-*-blanca.gif, que es un GIF de
    // 200x88 con el 100% de los píxeles blancos: en la página se ve como un hueco vacío
    // al lado de la bandera. Se sustituye por una etiqueta legible. Cuando sí hay
    // medusas el src es banner-*-medusas.gif (morado) y se sirve la imagen tal cual.
    if (evento === "medusas" && /-blanca\.\w+$/i.test(src)) {
      return svgText("sin medusas", fragStatus);
    }

    // El src es del proveedor o no se sigue: si no, esto sería un proxy abierto.
    let imgUrl;
    try {
      imgUrl = new URL(src, upstream);
    } catch {
      return fail(502, "El proveedor devolvió un src no parseable: " + src);
    }
    if (imgUrl.hostname !== UPSTREAM_HOST) {
      return fail(502, "El proveedor apuntó fuera de su dominio: " + imgUrl.hostname);
    }

    let img;
    try {
      img = await fetch(imgUrl.toString(), {
        headers: {
          "Referer": SPOOF_REFERER,
          "User-Agent": "Mozilla/5.0 (proxy-playas-mojacar)",
          "Accept": "image/avif,image/webp,image/gif,image/png,image/*,*/*;q=0.8",
        },
      });
    } catch (e) {
      return fail(502, "Imagen no alcanzable: " + e.message);
    }

    const ctype = img.headers.get("content-type") || "";
    if (!img.ok || !ctype.startsWith("image/")) {
      return fail(502, `La imagen respondió ${img.status} (${ctype})`, {
        "X-Upstream-Status": String(img.status),
        "X-Banner-Src": imgUrl.toString(),
      });
    }

    return new Response(await img.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": ctype,
        // El estado oficial cambia una vez al día; la página ya cachebustea con _ts.
        "Cache-Control": "no-store",
        "X-Upstream-Status": String(fragStatus),
        "X-Banner-Src": imgUrl.toString(),
        ...cors(),
      },
    });
  },
};

async function observedStatus() {
  try {
    const beaches = await Promise.all(ALLOWED_PLAYAS.map(async playa => {
      const [flagFragment, jellyfishFragment, dateFragment] = await Promise.all([
        fetchFragment(playa, "bandera"),
        fetchFragment(playa, "medusas"),
        fetchFragment(playa, "fecha"),
      ]);
      const flagSrc = imageSource(flagFragment);
      const jellyfishSrc = imageSource(jellyfishFragment);
      const reportedService = normaliseLifeguardServiceSource(flagSrc);
      return {
        beachId: BEACH_IDS[playa],
        flag: normaliseFlagSource(flagSrc),
        lifeguardService: reportedService === "active"
          ? lifeguardServiceAt(new Date(), playa)
          : reportedService,
        jellyfish: normaliseJellyfishSource(jellyfishSrc),
        observedAtLocal: stripTags(dateFragment) || null,
        source: "gestiondeplayas",
      };
    }));
    return new Response(JSON.stringify({
      fetchedAt: new Date().toISOString(),
      beaches,
    }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=30, s-maxage=60",
        ...cors(),
      },
    });
  } catch (error) {
    return fail(502, "No se pudo normalizar el estado oficial: " + error.message);
  }
}

async function fetchFragment(playa, evento) {
  const upstream = `https://${UPSTREAM_HOST}/api/` +
    `?localidad=mojacar&playa=${playa}&evento=${evento}` +
    `&tipo=banner&tamano=mini&clave_api=${KEY}`;
  const response = await fetch(upstream, {
    headers: {
      "Referer": SPOOF_REFERER,
      "User-Agent": "Mozilla/5.0 (proxy-playas-mojacar)",
      "Accept": "text/html,image/*,*/*;q=0.8",
    },
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  if (!response.ok) throw new Error(`${evento}/${playa}: HTTP ${response.status}`);
  return response.text();
}

function imageSource(fragment) {
  return (fragment.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "";
}

export function normaliseFlagSource(src) {
  const match = src.match(/-(verde|amarilla|roja)\.[a-z0-9]+(?:[?#].*)?$/i);
  return match
    ? ({ verde: "green", amarilla: "yellow", roja: "red" })[match[1].toLowerCase()]
    : "unknown";
}

export function normaliseLifeguardServiceSource(src) {
  if (/-(verde|amarilla|roja)\.[a-z0-9]+(?:[?#].*)?$/i.test(src)) return "active";
  if (/-sin\.[a-z0-9]+(?:[?#].*)?$/i.test(src)) return "inactive";
  return "unknown";
}

const CORE_SERVICE_BEACHES = new Set(["01", "09", "12", "13"]);

// Calendario oficial de la temporada de baño 2026 publicado por Turismo Mojácar.
// En julio y agosto abren las siete playas; el resto de periodos solo las cuatro
// playas indicadas por el Ayuntamiento. La hora final es exclusiva.
export function lifeguardServiceAt(date, playa) {
  const local = madridParts(date);
  if (local.year !== 2026) return "unknown";
  const dayKey = local.month * 100 + local.day;
  const allBeaches = dayKey >= 701 && dayKey <= 831;
  const coreBeachDay = isCoreServiceDay(dayKey);
  if (!allBeaches && !(coreBeachDay && CORE_SERVICE_BEACHES.has(playa))) return "inactive";
  const closesAt = allBeaches && (local.weekday === "Sat" || local.weekday === "Sun") ? 20 : 19;
  return local.hour >= 11 && local.hour < closesAt ? "active" : "inactive";
}

function isCoreServiceDay(dayKey) {
  return (dayKey >= 328 && dayKey <= 405) ||
    [516, 517, 523, 524, 530, 531, 606, 607, 613, 614].includes(dayKey) ||
    (dayKey >= 901 && dayKey <= 913) ||
    [919, 920, 926, 927, 1003, 1004, 1010, 1011, 1012, 1017, 1018,
      1024, 1025, 1031, 1101].includes(dayKey);
}

function madridParts(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    weekday: parts.weekday,
  };
}

export function normaliseJellyfishSource(src) {
  if (!src) return null;
  return /-medusas\.[a-z0-9]+(?:[?#].*)?$/i.test(src);
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// La fecha se sirve como SVG para que entre por el mismo <img> que las banderas.
function svgText(text, upstreamStatus) {
  const safe = text.replace(/[<>&"]/g, c =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const width = Math.max(40, Math.round(safe.length * 7.3) + 8);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" ` +
    `viewBox="0 0 ${width} 20" role="img" aria-label="${safe}">` +
    `<text x="0" y="14" font-family="IBM Plex Mono,ui-monospace,monospace" ` +
    `font-size="12" fill="#6C7B76">${safe}</text></svg>`;
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Upstream-Status": String(upstreamStatus),
      ...cors(),
    },
  });
}

function fail(status, message, extra = {}) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra,
      ...cors(),
    },
  });
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}
