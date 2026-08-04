# Costas · maquetas topográficas

Maquetas topográficas de la costa en cuatro niveles —comarca, municipio y
playa, más el índice que las reparte— con el Sol, la sombra orográfica y la
previsión de cada momento. Cubre el Levante de Almería con Cabo de Gata y la
Mariña de Lugo. La jerarquía de rutas está en
[`docs/navigation.md`](docs/navigation.md); la deuda pendiente, las mejoras de
producto y las vías de explotación, en [`docs/roadmap.md`](docs/roadmap.md).

El proyecto empezó como una página estática de una sola vista con el estado de
las banderas (verde / amarilla / roja) y el aviso de medusas de las playas de
Mojácar. Esa portada sigue archivada en `/flags/` y su parte viva —el estado
oficial— alimenta hoy las fichas de playa.

Lee los datos de `gestiondeplayas.com`, el proveedor que alimenta la web del ayuntamiento,
en lugar de depender del widget de
[mojacar.es](https://www.mojacar.es/mojacar-disfruta/estado-de-las-playas/).

## Estado del repo

Situación a **30-07-2026**.

| | |
|---|---|
| Producción | https://playas-16y.pages.dev/ |
| Repo | `git@github.com:GHontanar/playas.git`, rama única `main` |
| Despliegue | Cloudflare Pages con integración Git: cada push a `main` redespliega |
| Acceso desde este equipo | deploy key ed25519 en `~/.ssh/id_ed25519`, sin passphrase, con *Allow write access* |

Historia, tres commits:

1. `9cd6c1d` — la página estática inicial.
2. `e61a2b3` — el proxy funcional: seguir el `src` del fragmento HTML en vez de tratar el
   endpoint como una imagen. Sin esto no cargaba ni un banner.
3. `037a804` — el aviso de medusas deja de ser un hueco en blanco.

### Qué está comprobado

- Los 3 eventos (`bandera`, `medusas`, `fecha`) de las 7 playas, contra el proveedor real
  a través de `wrangler pages dev`: todos 200, con el GIF del estado correcto.
- El caso «hay medusas», simulando el fragmento del proveedor porque hoy no hay ninguna:
  devuelve el GIF morado íntegro.
- Parámetros inválidos (`playa`, `evento`, `tamano` fuera de las listas blancas): 400.

### Qué no está comprobado

- Los banners servidos **desde producción**; lo verificado es el mismo código bajo
  `wrangler pages dev`.
- El estado **bandera roja**: no se ha dado ningún día de los observados.
- El comportamiento **fuera de temporada** (antes del 9 abr o después del 9 oct), cuando
  presumiblemente todas las playas pasan a `bandera=sin`.

### Decisión pendiente

La lista de las 7 playas está hardcodeada en `BEACHES` (`flags/index.html`), porque la API no
expone nombres. Si el ayuntamiento dota un puesto más a mitad de temporada, la página no
lo mostrará. La alternativa propuesta y no implementada es un `/api/estado` que devuelva
en un solo JSON los códigos 01–15 leídos con `tipo=texto`, y que la página pinte solo los
que traen bandera ≠ `sin`: la lista deja de ir a mano, las banderas se pintan en CSS con
las variables de `:root` y se pasa de 21 peticiones por carga a 1.

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
  nombres de las playas, así que la lista de `BEACHES` va a mano en `flags/index.html`.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html` · `src/landing-main.ts` | El índice: elección de comarca con las maquetas en miniatura. |
| `region/index.html` · `src/region-main.ts` | El nivel comarcal, parametrizado por `src/regions/catalog.ts`. |
| `coast/index.html` · `src/coast-main.ts` | La costa municipal, parametrizada por `src/beaches/catalog.ts`. |
| `terrain/index.html` · `src/terrain-main.ts` | La ficha de playa. |
| `src/map/` | Escenario, relieve, agua, zócalo y capas, compartidos por los cuatro niveles. |
| `src/nav/breadcrumb.ts` | Migas de pan y fichas hermanas, derivadas de los dos catálogos. |
| `flags/index.html` | La portada histórica de banderas. Sin dependencias ni build. |
| `worker/playas-mojacar-proxy.js` | El proxy. Vale como Worker suelto y como origen de la Pages Function. |
| `worker/wrangler.toml` | Config para desplegarlo como Worker independiente. |
| `functions/api/banner.js` | Adaptador de 2 líneas que publica el proxy en `/api/banner`. |

La constante `PROXY` de `flags/index.html` apunta a `/api/banner` (ruta relativa, mismo origen).
Si prefieres un Worker independiente, pon ahí su URL `https://…workers.dev/`.

## Desarrollo

```sh
npm install
npm run dev
```

La aplicación tiene cuatro niveles y `/` es el índice desde el que se elige
comarca:

| Nivel | Ruta | Rejilla |
|---|---|---|
| Índice | `/` | miniaturas a 400 m |
| Comarca | `/region/?region=levante`, `/region/?region=marina-lucense` | 50 m |
| Costa | `/coast/?municipality=mojacar` … | 20 m |
| Playa | `/terrain/?beach=ventanicas` … | 2,5 m |

Cada nivel enlaza al de arriba con migas de pan y al de abajo tanto sobre la
maqueta como con fichas en HTML alcanzables con teclado. Los detalles están en
[`docs/navigation.md`](docs/navigation.md). La portada histórica de banderas
permanece archivada en `/flags/`, sin enlaces desde la aplicación. Se puede
probar la maqueta municipal con colores ficticios mediante `/coast/?demo=1`.

`npm run dev` monta también `functions/api/*` mediante un plugin del servidor de
desarrollo, así que `/api/status` y `/api/banner` devuelven el estado real y las
franjas de la costa aparecen sombreadas como en producción. Sin ese plugin,
`vite dev` respondía a `/api/status` con el HTML de la aplicación y un 200, y la
costa se quedaba sin banderas. Para comprobar además el build servido por el
propio Pages:

```sh
npm run build
npx wrangler pages dev dist
```

Las otras vistas municipales son `/coast/?municipality=garrucha`,
`/coast/?municipality=vera` y `/coast/?municipality=carboneras`; sus fichas se
resuelven con los identificadores `carboneras-*`, `garrucha-*` y `vera-*`.
Barreiros (Lugo) se abre en
`/coast/?municipality=barreiros`: usa el mismo motor con `seaSide: north`
(costa orientada al Cantábrico, EPSG:25829), la línea de costa del Instituto
Hidrográfico de la Marina y la máscara de inundación para su ría e islotes.

## Maquetas comarcales

`/region/` monta el bloque de 50 m con toda la costa de una comarca —el Levante
de Almería con Cabo de Gata, y la Mariña de Lugo— sobre la máscara de agua
deducida por inundación desde el borde del recorte, sin `seaSide`: a esa escala
la costa gira en un cabo y el mar puede rodear la maqueta por dos lados. Colorea
la tierra con CORINE y el agua con la batimetría oficial, rotula los lugares y
recorre la costa por tramos con el scroll. Lo que distingue una comarca de otra
—recorte, anclas, sectores y dirección de mar abierto— está en
`src/regions/catalog.ts`; el relieve y el agua, en `src/map/regionChunk.ts`, que
es también lo que dibuja las miniaturas del índice.

El índice enseña esos mismos bloques a 400 m por celda, montados con el mismo
escenario y el Sol de ahora. Se regeneran con:

```sh
npm run data:thumbnails
```

## Maquetas topográficas por municipio

La ruta `/terrain/` permite elegir 31 playas de Mojácar, Carboneras, Garrucha,
Vera y Barreiros. En Mojácar incluye Marina de la Torre, Descargador, Piedra
Villazar, El Cantal, Lance Nuevo, Ventanicas y Venta del Bancal. Cada playa
tiene recorte, cámara, tramo litoral y caster orográfico propios, pero comparte
la misma escena y controles. Usa MDT02 oficial, costa DERA (Andalucía) o IHM
(Galicia), edificios INSPIRE de Catastro,
calles OSM preparadas offline, malla Three.js, cámara ortográfica, SunCalc y
sombra física horaria. Cada ficha muestra la bandera oficial normalizada, la
disponibilidad del servicio de socorrismo y la hora observada.
También calcula para la fecha seleccionada el primer minuto de sombra
orográfica en el centro de la playa y cuánto se adelanta respecto a la puesta
astronómica estándar.
Todas las playas incluyen además un glifo 3D de viento independiente de la
maqueta, orientado según el vector meteorológico real, y la tarjeta
lo clasifica como viento de mar, de tierra o lateral. Esta capa no simula desviaciones locales por relieve
o edificios y permanece aislada de la dirección del oleaje.
El mar ofrece tres estados animados puramente artísticos —calma, marejadilla y
agitado— dentro de los controles de depuración. La bandera es una observación y
no modifica ese estado artístico, que continúa separado de cualquier dato o
predicción marina.
Las crestas se orientan con la dirección prevista del oleaje. Los espigones
declarados en Lance Nuevo y Venta del Bancal generan además una zona visual de
abrigo a sotavento, sin pretender sustituir una simulación hidrodinámica.
La tarjeta principal consulta Open-Meteo Weather y Marine para la hora elegida
y presenta aire, sensación térmica, viento, UV, lluvia, temperatura superficial
del mar y oleaje. Son valores de modelo; agua y olas pueden compartir celda
entre varias playas y no equivalen a una medición en la orilla.
La altura significativa selecciona automáticamente calma, marejadilla o agitado
con una calibración histórica común a toda la costa; el periodo ajusta el ritmo
de la animación. Véase [`docs/wave-calibration.md`](docs/wave-calibration.md).
La decisión gráfica está en
[`docs/adr/0001-terrain-renderer.md`](docs/adr/0001-terrain-renderer.md).

Comprobaciones:

```sh
npm test
npm run verify:assets
npm run build
```

Estado validado: configuración y assets del catálogo completo (31 playas en
cinco municipios), pruebas unitarias, regeneración desde originales locales y
smoke tests WebGL de escritorio y móvil. Los siete perfiles de horizonte
originales de Mojácar se contrastaron con PVGIS y conservan
margen después de sus obstáculos críticos. La navegación se comprobó en un
Nothing Phone 3 y un Redmi 14; queda pendiente registrar FPS y memoria GPU.

Regeneración geográfica desde las fuentes oficiales:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-geo.txt
scripts/download-dem.sh
scripts/download-coastline.sh
scripts/download-urban.sh
npm run data
npm run verify:assets
```

Con las fuentes ya descargadas, se puede regenerar solo una playa:

```sh
npm run data:beach -- el-cantal
```

El chunk general usa el mismo pipeline:

```sh
npm run data:beach -- mojacar-coast
npm run data:beach -- carboneras-coast
npm run data:beach -- garrucha-coast
npm run data:beach -- vera-coast
```

Los originales se guardan en `data/source/`, ignorado por Git. Véanse
[`docs/data-sources.md`](docs/data-sources.md),
[`docs/terrain-pipeline.md`](docs/terrain-pipeline.md) y
[`docs/validation.md`](docs/validation.md). La correspondencia entre el catálogo
oficial y los puestos de Carboneras está en
[`docs/carboneras-scope.md`](docs/carboneras-scope.md).
El inventario y la limitación actual de banderas de Garrucha y Vera se explican
en [`docs/garrucha-vera-scope.md`](docs/garrucha-vera-scope.md).

El estudio de viabilidad para replicar el modelo en Barreiros (Lugo) —inventario
de playas, fuentes evaluadas e implementación— está en
[`docs/barreiros-scope.md`](docs/barreiros-scope.md); la propuesta de una marea
dinámica en el chunk (pendiente de implementar), en
[`docs/tide-model.md`](docs/tide-model.md).

## Despliegue

La nueva entrada TypeScript requiere cambiar una vez la configuración de
Cloudflare Pages a:

- build command: `npm run build`
- output directory: `dist`

El directorio raíz `functions/` sigue siendo detectado por Pages y el build
conserva la página histórica de banderas como `dist/flags/index.html`.

Despliegue manual equivalente:

```sh
npm run build
npx wrangler pages deploy dist --project-name playas-16y
```

La integración Git continúa siendo la vía recomendada tras actualizar esos dos
campos. El Worker independiente solo se despliega, si se desea, con
`npx wrangler deploy` desde `worker/`.

## Notas

La bandera publicada es una observación, no una prueba de que haya socorristas
en ese instante. `/api/status` la cruza con el calendario oficial de 2026 en
`Europe/Madrid`. Durante julio y agosto el horario es 11:00–19:00 de lunes a
viernes y 11:00–20:00 sábados y domingos. Las vistas topográficas revalidan el
estado tras cada cambio de hora; la portada histórica lo hace al recargar o al
pulsar «Actualizar».
Calendario: [Temporada de baño 2026 de Turismo Mojácar](https://www.mojacar.es/mojacar-disfruta/playas/).

La `clave_api` es la misma que va embebida en el HTML público de mojacar.es; no es un
secreto. Aun así, al vivir en el Worker deja de estar en el HTML de esta página.

Emergencias: **112**.
