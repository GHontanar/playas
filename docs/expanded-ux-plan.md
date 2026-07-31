# Plan de experiencia ampliada

## Objetivo

La aplicación tendrá dos niveles coherentes, ambos con estética de maqueta:

1. `/coast/`: chunk general de 8,5 km con toda la costa de Mojácar y las siete
   zonas de baño seleccionables.
2. `/terrain/?beach=<id>`: drill-in topográfico de cada playa, con Sol, sombra,
   edificios, calles, agua volumétrica y controles de depuración.

La portada histórica `/` se conserva mientras se valida el nuevo acceso.

## Estado observado: dependencia inicial

La bandera no se deduce de los píxeles del GIF. La Pages Function extrae el
nombre del recurso que ya entrega el proveedor (`verde`, `amarilla`, `roja`) y
lo normaliza mediante `/api/status`. Medusas es una dimensión independiente.

```ts
type FlagState = "green" | "yellow" | "red" | "unknown";
type LifeguardServiceState = "active" | "inactive" | "unknown";

interface ObservedBeachStatus {
  beachId: string;
  flag: FlagState;
  lifeguardService: LifeguardServiceState;
  jellyfish: boolean | null;
  observedAtLocal: string | null;
  source: "gestiondeplayas";
}
```

`/api/banner` se mantiene para compatibilidad. El endpoint agregado usa caché
de borde de un minuto y reduce el acoplamiento del frontend a los banners. El
servicio activo se obtiene cruzando el banner con el calendario oficial 2026 en
`Europe/Madrid`; un GIF verde retenido después del cierre no se presenta como
socorrismo activo. Las vistas revalidan tras los cambios de hora.

## Chunk general

No combina los siete DEM detallados. Tiene derivados propios:

- MDT02 a 20 m, 165 × 425 celdas;
- caster auxiliar a 40 m;
- costa DERA completa;
- masas urbanas generalizadas desde Catastro;
- viario OSM simplificado a las clases legibles a escala municipal;
- agua volumétrica en estado visual calmado;
- dos espigones DERA preservados;
- cámara ortográfica estable con bearing 45° y pitch 32°.

Las franjas seleccionables siguen la costa y la longitud oficial de cada
playa. Su anchura se exagera para ser visible y táctil; no representa una
delimitación administrativa ni una distancia métrica. El color tenue expresa
bandera observada únicamente cuando el servicio está activo. `inactive` y
`unknown` dejan visible el material original, sin inferir un color. El símbolo
de medusas se mantiene separado.

## Drill-in

Seleccionar una franja abre el chunk detallado existente. La ficha separa
visualmente:

1. observado: bandera, medusas y hora;
2. previsto: meteorología y mar con instante de validez y modelo;
3. derivado: exposición, viento onshore/offshore y potencia aproximada;
4. físico: Sol, horizonte orográfico y sombra sobre el MDT.

Una bandera nunca se traducirá directamente a intensidad de oleaje porque su
causa puede no ser marina.

## Fases

### Fase A — entrada topográfica

- [x] contrato semántico de bandera y medusas;
- [x] endpoint agregado `/api/status`;
- [x] pipeline del overview;
- [x] maqueta de costa completa;
- [x] separación gráfica no cartográfica entre las siete zonas de playa;
- [x] zonas seleccionables con ratón, toque y teclado;
- [x] drill-in hacia las siete escenas;
- [x] encuadre de escritorio y móvil;
- [x] navegación restringida por pan y zoom, rótulos sobre el chunk y reencuadre;
- [x] recorrido editorial ligado al scroll: vista general, aproximación a Marina
  de la Torre y trayectoria reversible hasta Venta del Bancal;
- [x] recorrido condensado a unas tres pantallas de desplazamiento efectivo;
- [x] cuatro únicos keyframes de cámara: general, norte, centro y sur;
- [x] servicio activo/inactivo/desconocido separado del color de bandera;
- [x] bandera y hora observada en las siete fichas topográficas;
- [x] sombreado de las franjas del overview solo con bandera activa;
- [ ] sustituir `/` por el nuevo acceso tras validación de producto.

### Fase B — previsión puntual

- [x] spike de Open-Meteo Weather y Marine;
- [ ] selección y validación de puntos terrestre y marino;
- [x] contrato mínimo de previsión, unidades y tiempos;
- [ ] caché y estados de error;
- [x] presentación separada de la observación.

### Fase C — adaptación por playa

- [ ] orientación derivada y auditada;
- [ ] viento onshore/offshore;
- [ ] alineación y exposición al swell;
- [ ] apantallamiento aproximado por cabos;
- [ ] potencia de oleaje etiquetada como estimación;
- [ ] traducción de la previsión a los tres estados artísticos del agua.

### Fase D — contraste y producto

- [ ] contraste opcional con boya de Puertos del Estado;
- [ ] validación física playa por playa;
- [ ] rendimiento en móvil real;
- [ ] accesibilidad y estados fuera de temporada;
- [ ] decisión final de portada y transición visual.

## Decisiones vigentes

- Three.js para overview y detalle; no se añade MapLibre.
- Pages Functions para agregación; no se introduce Dendrita todavía.
- Geometría costera y urbana derivada de fuentes, no dibujada a mano.
- Observación, previsión y derivaciones nunca comparten semántica visual.
