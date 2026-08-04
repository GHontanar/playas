import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig, type Plugin } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Monta `functions/api/*.js` en el servidor de desarrollo.
 *
 * En producción esas rutas las sirve Cloudflare Pages; `vite dev` no las conoce
 * y devolvía el HTML de la aplicación con un 200, así que `response.ok` era
 * cierto, el `json()` reventaba y la costa se quedaba sin banderas —en silencio,
 * porque la vista trata el fallo de estado como «sin datos» y deja el material
 * original. Las funciones son Web estándar (`Request`/`Response`/`fetch`), así
 * que se ejecutan tal cual en Node; no hay una segunda implementación que
 * mantener. Solo afecta a `npm run dev`.
 */
function pagesFunctions(): Plugin {
  return {
    name: "pages-functions",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?")[0] ?? "";
        if (!path.startsWith("/api/")) return next();
        // Sin `..` ni subrutas: el nombre del fichero sale de un solo segmento.
        const name = path.slice("/api/".length);
        const file = resolve(root, "functions/api", `${name}.js`);
        if (!/^[a-z0-9-]+$/.test(name) || !existsSync(file)) return next();
        void (async () => {
          try {
            const module = await import(pathToFileURL(file).href) as {
              onRequest(context: { request: Request }): Promise<Response> | Response;
            };
            const headers = new Headers();
            for (const [key, value] of Object.entries(request.headers)) {
              if (typeof value === "string") headers.set(key, value);
            }
            const result = await module.onRequest({
              request: new Request(`http://${request.headers.host}${request.url}`, {
                method: request.method,
                headers
              })
            });
            response.statusCode = result.status;
            result.headers.forEach((value, key) => response.setHeader(key, value));
            response.end(Buffer.from(await result.arrayBuffer()));
          } catch (error) {
            response.statusCode = 502;
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify({
              error: "La Pages Function falló en desarrollo",
              detail: error instanceof Error ? error.message : String(error)
            }));
          }
        })();
      });
    }
  };
}

export default defineConfig({
  plugins: [pagesFunctions()],
  build: {
    rollupOptions: {
      // Un punto de entrada por nivel de la jerarquía, más la portada histórica
      // de banderas, que se conserva archivada y sin enlaces desde la app.
      input: {
        main: resolve(root, "index.html"),
        region: resolve(root, "region/index.html"),
        coast: resolve(root, "coast/index.html"),
        terrain: resolve(root, "terrain/index.html"),
        flags: resolve(root, "flags/index.html")
      }
    }
  },
  test: {
    environment: "node"
  }
});
