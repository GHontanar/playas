# Modelo de marea dinámica en el chunk

Estado: **propuesta, sin implementar**. Fecha: 2 de agosto de 2026.
La implementación de Barreiros (ver `docs/barreiros-scope.md`) mantiene la
línea de costa fija en la pleamar IHM; este documento valora el paso siguiente.

Motivación: en Barreiros (Lugo) la carrera de marea alcanza ~4 m (frente a los
~0,3 m de Almería). Una línea de costa fija no representa la playa ni en
pleamar ni en bajamar. Este documento valora cómo añadir una marea dinámica al
chunk existente.

## Arquitectura actual relevante

- El mar es un plano en `config.seaLevelMeters` con una **máscara agua/tierra
  horneada por vértice** (`coastMask`, `src/map/sea.ts:95-98` y `482-511`)
  contra la costa fija del GeoJSON; el fragment shader descarta la tierra
  (`vCoastMask < 0.5`). `shoreDistance` también se hornea
  (`src/map/sea.ts:430-453`).
- El terreno abate mar adentro a `seaLevelMeters − 3` en construcción
  (`src/map/terrain.ts:73`) y su malla se escala verticalmente por la
  exageración (`src/map/createScene.ts:84`), mientras el agua vive en cota real
  sin exagerar (`src/map/sea.ts:298`).
- Rompientes y zona de surf se anclan a la costa fija y a `shoreDistance`
  (`src/map/sea.ts:302-305`, `455-480`), aunque **ya se recalculan por frame en
  CPU** (`src/map/sea.ts:666-739`).
- La línea de costa visible y las cintas de arena húmeda usan la costa fija
  (`src/map/coastline.ts:88-105`). Las zonas de playa del overview son
  polígonos estáticos para la interacción (`src/map/beachZones.ts`).
- El pipeline produce el DEM visible y el caster con
  `scripts/prepare_dem.py` (véase `docs/terrain-pipeline.md`).

## Diseño propuesto

1. **Atributo de cota por vértice de agua.** Hornear la elevación del DEM bajo
   cada vértice del plano de mar. El plano ya usa la resolución de la malla del
   terreno cuando existen estructuras costeras (`src/map/sea.ts:89-94`); para la
   marea debería usarse siempre esa resolución, para que la línea de costa móvil
   no se vea facetada por la cuadrícula por defecto de 96×180.
2. **Máscara dinámica.** Sustituir el `coastMask` binario horneado por una
   comparación por frame: `agua = cotaTerreno < nivelDeAgua`, con un margen de
   suavizado. La línea de costa se desplaza sola al subir o bajar el nivel.
   Coste de runtime: un uniform y una comparación por vértice.
3. **Espacio de comparación: espacio-maqueta.** Comparar `cota × exageración`
   contra `nivel × exageración` para que el borde del agua coincida
   geométricamente con la superficie renderizada del terreno. Es coherente con
   la filosofía «maqueta, no reproducción métrica» de
   `docs/adr/0001-terrain-renderer.md`; el desplazamiento horizontal que se ve
   queda supeditado a la exageración y debe documentarse así.
4. **Terreno apto para el rango.** Sustituir el abatido fijo a `−3 m` por una
   **rampa batimétrica** desde la bajamar hacia profundidad, generada en el
   pipeline y anclada a la **línea de bajamar IHM**. MDT02 interpola la lámina
   de agua con baja fiabilidad (documentado en `docs/data-sources.md`), así que
   la rampa debe ser sintética mar adentro de la bajamar, no el valor crudo del
   DEM. Invariante validable: **en bajamar, el agua debe coincidir con la línea
   de bajamar IHM** (la IHM entrega pleamar y bajamar).
5. **Rompientes y surf.** Opción recomendada: desplazar `offshoreDistance` de
   las rompientes según `Δnivel / pendiente` y su cota según el nivel (ya se
   actualizan por frame). Opción más exacta y costosa: recalcular la envolvente
   de costa móvil por nivel; probablemente innecesaria para el alcance visual.
6. **Fuente de marea.** El API de MeteoGalicia
   (`praias/predicion?idPraia=1994`) devuelve Preamar/Baixamar del puerto de
   referencia «Ría de Foz» con alturas (0,8–4,0 m), verificado el 2-08-2026.
   Alternativa autoritativa: predicciones públicas de Puertos del Estado.
   Requiere un adaptador tipo `/api/status` + interpolación semidiurna suave
   entre eventos consecutivos. La marea es determinista del instante local: el
   **slider de fecha y hora ya existente** (`src/terrain-main.ts`) es el
   conductor natural, sin reloj ni temporizador adicionales.
7. **Capa de interacción.** Las zonas de playa del overview son estáticas; usar
   el **extremo de bajamar** como área clicable para que sigan funcionando con
   cualquier nivel (el área intermareal completa queda así acotada).

## Alternativa ligera descartada

Animar solo la cota vertical del plano de agua **sin mover la línea de costa**
(máscara fija) «sube y baja el mar» pero no expone ni sumerge arena. En playas
planas como Coto o Arealonga sería engañoso y no representaría la marea real.
No se recomienda.

## Riesgos

- **Coherencia con la exageración vertical** es la parte más sutil; resolverse
  en espacio-maqueta la deja autoconsistente y documentable.
- **Resolución de la línea móvil**: la cuadrícula del plano debe seguir la del
  terreno para que el borde no se vea en dientes de sierra.
- **Transparencias** entre el plano de agua y las cintas de arena húmeda en el
  borde móvil: exige cuidado en `renderOrder` (patrón ya existente).
- **Fidelidad del DEM bajo el agua**: mitigada por la rampa sintética anclada a
  la bajamar IHM y por la validación de ese invariante.
- La marea es **ortogonal** a la decisión de bandera desconocida de Barreiros;
  no se interfieren.

## Esfuerzo estimado

Medio, comparable a la animación del oleaje original. Cambios contenidos en
`src/map/sea.ts`, `src/map/terrain.ts`, `src/map/coastline.ts`, el pipeline
(`scripts/prepare_dem.py`), la configuración por playa (puerto de referencia,
nivel base, pendiente) y un adaptador de mareas. No cambia la arquitectura: se
convierte en dinámico un valor que hoy es estático.

## Límites

- La marea mostrada es la del **puerto de referencia** de la zona, con
  interpolación semidiurna; no modela horas locales ni distorsiones de
  bahía/canal.
- El desplazamiento horizontal del agua queda supeditado a la exageración
  vertical y a la resolución del DEM (2,5 m), no a batimetría medida.
- No pretende sustituir tablas de mareas ni criterios de seguridad.
