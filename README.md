# Estado de las playas · Mojácar

Página estática de una sola vista con el estado de las banderas (verde / amarilla / roja)
y el aviso de medusas de las playas de Mojácar.

Lee los datos de `gestiondeplayas.com`, el proveedor que alimenta la web del ayuntamiento,
en lugar de depender del widget de
[mojacar.es](https://www.mojacar.es/mojacar-disfruta/estado-de-las-playas/).

## Por qué hace falta un proxy

El endpoint del proveedor **no devuelve una imagen**, devuelve un fragmento de HTML
(`content-type: text/html`, ~132 bytes) con la imagen dentro:

```
<img src="https://www.gestiondeplayas.com/mojacar/api/images/banner-mini-amarilla.gif" ...>
```

Al abrir esa URL en el navegador se ve la bandera porque el navegador parsea el HTML y
va a buscar el GIF. Un `<img src="...api/...">` no da ese segundo paso: recibe texto donde
espera bytes y falla. El proveedor tampoco envía cabeceras CORS, así que leerlo con
`fetch()` desde el navegador también está bloqueado.

`worker/playas-mojacar-proxy.js` da ese salto del lado servidor: pide el fragmento, extrae
el `src`, comprueba que sigue apuntando al dominio del proveedor y reexpone los bytes del
GIF con CORS abierto. El evento `fecha` no es una imagen ni en origen (devuelve un `<span>`
con la marca de tiempo), así que se sirve como SVG para que entre por el mismo `<img>`.

Dos rarezas más del proveedor que el proxy normaliza:

- **«Sin medusas» es una imagen en blanco.** `banner-*-blanca.gif` es un GIF de 200×88 con
  el 100% de los píxeles blancos, así que en la página se veía un hueco vacío al lado de la
  bandera. Se sustituye por la etiqueta «sin medusas». Cuando sí hay medusas el proveedor
  sirve `banner-*-medusas.gif` (morado) y esa imagen se pasa tal cual.
- **Los códigos de playa tienen huecos.** Solo 01, 04, 05, 07, 09, 12 y 13 tienen socorrismo
  y datos del día; el resto (02, 03, 06, 08, 10, 11, 14, 15…) existen en el sistema pero
  responden `bandera=sin` con la fecha del cierre del día anterior. La API no expone los
  nombres de las playas, así que la lista de `BEACHES` va a mano en `index.html`.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html` | La página. Sin dependencias ni build. |
| `worker/playas-mojacar-proxy.js` | El proxy. Vale como Worker suelto y como origen de la Pages Function. |
| `worker/wrangler.toml` | Config para desplegarlo como Worker independiente. |
| `functions/api/banner.js` | Adaptador de 2 líneas que publica el proxy en `/api/banner`. |

La constante `PROXY` de `index.html` apunta a `/api/banner` (ruta relativa, mismo origen).
Si prefieres un Worker independiente, pon ahí su URL `https://…workers.dev/`.

## Desarrollo

```sh
npx wrangler pages dev .
```

Sirve la página y `/api/banner` juntos, igual que en producción.

## Despliegue

Cloudflare Pages con integración Git: sin build command, output directory `/`. El
directorio `functions/` se detecta solo, así que la web y el proxy se despliegan en el
mismo paso y cada `git push` redespliega.

## Notas

El estado oficial se actualiza una vez al día (aprox. 9 abr – 9 oct, franja 11:30–11:45),
así que la página no auto-refresca: carga al abrir y vuelve a pedir los banners solo al
pulsar «Actualizar».

La `clave_api` es la misma que va embebida en el HTML público de mojacar.es; no es un
secreto. Aun así, al vivir en el Worker deja de estar en el HTML de esta página.

Emergencias: **112**.
