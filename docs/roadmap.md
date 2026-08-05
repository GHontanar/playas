# Deuda, mejoras y explotación

Revisión del **03-08-2026**, con el catálogo en 2 comarcas, 5 municipios y
31 playas. Las cifras salen de medir el repo ese día, no de estimarlas: si al
leer esto ya no cuadran, vuelve a medirlas antes de decidir.

Índice: [deuda técnica](#deuda-técnica-y-arquitectura) ·
[producto](#mejoras-de-producto) · [explotación](#explotación) ·
[lo que no hay que tocar](#lo-que-está-bien-y-no-hay-que-tocar).

## Deuda técnica y arquitectura

### 1. No hay red de seguridad automática

Lo más grave del repo no es código, es proceso.

- [x] Workflow de CI que ejecute `typecheck`, `test`, `verify:assets` y `build`
      en cada push y en cada PR. Había 92 pruebas en 15 ficheros y **nada las
      ejecutaba**; como Cloudflare Pages despliega en cada push a `main`, el
      único filtro entre un test roto y producción era acordarse de ejecutarlo a
      mano. Hecho en `.github/workflows/ci.yml`. No bloquea el despliegue —Pages
      no espera a Actions— pero deja constancia inmediata.
- [x] Commitear el trabajo pendiente. El 03-08-2026 había **233 ficheros sin
      commitear** y el último commit era de dos días antes: dentro estaban la
      integración completa de Barreiros y el nivel comarcal entero. Repartido en
      tres commits temáticos, comprobando que cada uno compila por separado.
- [x] ~~Linter y formateador~~. Descartado al fijar el proyecto como personal:
      con una sola persona y el código ya homogéneo es fricción sin retorno. Si
      alguna vez colabora alguien más, reconsiderarlo.

### 2. Duplicación que sobrevive

- [x] **Extraer el recorrido con scroll**, ahora en `src/story/scrollStory.ts`:
      progreso desde el scroll, redondeo a la parada más cercana, interpolación
      suavizada y `prefers-reduced-motion`. Lo que cambia entre niveles —el
      comarcal mira al objetivo, recoloca rótulos y dibuja a mano porque su
      escena no tiene bucle— se queda en `onFrame`. 132 líneas menos entre las
      dos vistas por 121 del módulo, y una sola implementación que mantener.
- [x] **Extraer el color del cielo** en `applySceneSky()`: eran cuatro líneas
      idénticas que sacan el cielo del lienzo al fondo de la página, la tinta de
      los rótulos y la barra del navegador.
- [x] ~~Un `bootstrapScene()` con el arranque común~~. Descartado tras medirlo:
      una vez fuera el recorrido y el cielo, lo que queda repetido son cuatro
      líneas de comprobación de WebGL con destinos de error distintos en cada
      vista, y usos del reloj solar que solo se parecen por fuera. Envolverlo
      sería una indirección que cuesta más de leer que las cuatro líneas.
- [ ] **Unificar los tres `scaffold-*.ts`.** `scaffold-carboneras`,
      `scaffold-garrucha-vera` y `scaffold-barreiros` son el mismo script con
      datos distintos.
- [ ] **Revisar las parejas `spike_region_*` / `spike_lugo_*`.** Diez ficheros
      Python que resuelven por duplicado DEM, mar y usos del suelo. Ahí la
      duplicación es más defendible, porque las fuentes son distintas —DERA
      andaluz frente a IHM gallego—, pero que `spike_lugo_land.py` tenga 384
      líneas y su equivalente andaluz 187 delata que el mismo problema se
      resolvió dos veces con criterios distintos. Con la tercera comarca se
      paga. Decidir entonces: o una base común con adaptadores por fuente, o
      dejarlo explícito y documentado como divergencia deliberada.

### 3. Dos mentiras al compilador

- [x] Quitados los `as unknown as BeachConfig` de `region-main.ts` y
      `landing-main.ts`. `createChunkBase` pedía un `BeachConfig` entero y solo
      usaba seis campos, así que los llamadores comarcales fabricaban uno falso.
      Ahora recibe `ChunkBaseOptions` y no queda ningún `as unknown as` en
      `src/`.

### 4. Una inversión de capas

- [x] `src/map/regionChunk.ts` importaba `src/regions/catalog.ts`: era el único
      punto donde la capa de dibujo conocía el dominio. Ahora recibe
      `StageBounds` y un `RegionGridSources` con las cinco rutas, y `src/map/`
      ya no importa `regions/`. Los módulos de playa siguen tomando
      `BeachConfig`, que ahí sí es su dominio propio.

### 5. Lo no probado es justo lo que tiene consecuencias

- [ ] **`beachZones.ts`**, 302 líneas, sin una sola prueba. Es lo que decide qué
      franja se pinta de qué color de bandera: la parte del sistema donde
      equivocarse tiene consecuencias para quien va a bañarse.
- [ ] **`loadStatus.ts`**, 59 líneas, sin prueba, y con lógica nueva desde que
      comprueba el `content-type` de `/api/status`.
- [ ] `createStage` y `createScene` tampoco tienen prueba. Ahí es legítimamente
      más difícil por WebGL; al menos cubrir el encuadre, que es aritmética
      pura.

### 6. El fichero que nadie querrá abrir

- [ ] Separar los shaders de `sea.ts` a su propio módulo. Son 777 líneas con un
      único export, de las cuales 173 son GLSL dentro de plantillas de texto.
      Extraerlas lo deja en unas 600 y, de paso, da resaltado de sintaxis justo
      donde más falta hace.

### 7. El índice paga por 31 playas que no usa

- [ ] Trocear el chunk común o cargar el catálogo de playas de forma dinámica.
      El código propio del índice son 2,33 kB, pero arrastra un chunk de 738 kB
      (190 kB gzip) que contiene Three.js **y las 31 fichas de playa completas**.
      Three.js es inevitable en una portada que dibuja dos maquetas; el catálogo
      no.

### 8. Fiabilidad de datos

- [ ] Caché y estados de error de la previsión, pendientes desde la fase B de
      [`expanded-ux-plan.md`](expanded-ux-plan.md).
- [ ] Degradación explícita de `/api/status`. Depende de raspar
      `gestiondeplayas.com`, un proveedor ajeno: hoy es un fallo tolerable, el
      día que haya un cliente pagando es un incidente.
- [ ] Ejecutar el protocolo de medición en móvil real que ya está escrito en
      [`performance.md`](performance.md) y nunca se ha ejecutado.
- [ ] Accesibilidad y estados fuera de temporada, pendientes de la fase D.

## Mejoras de producto

### El activo real

No es «mapas de playas», que es una mercancía. Es **la hora a la que el relieve
le quita el sol a una playa concreta**, calculada contra un MDT de 2,5 m con un
caster orográfico propio. Nadie más lo tiene y no se copia sin rehacer el
pipeline entero. Todo lo de abajo parte de ahí.

### Descubribilidad: lo que desbloquea el resto

- [ ] **Prerenderizar el contenido de las fichas.** Todo se pinta con JS dentro
      de `#app`: no hay HTML servido, ni `meta description` por playa, ni
      sitemap, ni datos estructurados. La consulta «hasta qué hora hay sol en la
      playa de Ventanicas» no puede encontrar el sitio, y es exactamente la que
      el producto contesta mejor que nadie. Como el build ya es estático, se
      puede emitir el HTML real de cada ficha —nombre, hora de sombra,
      orientación, texto— y que la escena hidrate encima. Misma jugada que las
      miniaturas del índice: precalcular lo que no necesita GPU.
- [ ] **Llevar fecha y hora a la URL.** Hoy viven en los `<input>`. Que
      `/terrain/?beach=ventanicas&fecha=2026-08-15&hora=19:00` sea compartible
      es UX y contenido indexable a la vez.
- [ ] Sitemap, datos estructurados y analítica. Sin medición no hay forma de
      saber si lo anterior funcionó.

### Profundizar en lo que ya distingue

- [ ] **Curva de sombra del día entero**, no un único minuto.
- [ ] **Sombra espacial**: qué parte de la playa pierde el sol primero. El DEM
      ya está cargado; hoy solo se evalúa el centro.
- [ ] **Ranking comarcal por sol a esta hora.** Convierte el nivel comarcal de
      escaparate en herramienta.
- [ ] **Índice de abrigo del viento por relieve.** Es la segunda pregunta real
      de quien va a la playa, y [`art-direction.md`](art-direction.md) dice
      explícitamente que el glifo actual no modela desviación orográfica. El MDT
      da para derivarlo.
- [ ] **Modo planificación**: «¿cuándo le da el sol a esta playa en octubre?».
      La aritmética solar es determinista y offline, así que se contesta para
      cualquier fecha sin tocar una API. Es además una mina de contenido
      indexable.

### Lo que se vuelve obligatorio al ampliar

- [ ] **Marea**, planteada en [`tide-model.md`](tide-model.md) y sin
      implementar. En el Mediterráneo es anecdótica; en Barreiros el rango es de
      varios metros y una playa que desaparece con la pleamar es el dato más
      importante del día. Si el plan es ampliar por el Cantábrico o el
      Atlántico, esto va **antes** que más playas mediterráneas.
- [ ] Fuente de bandera para Garrucha, Vera y Barreiros, hoy sin proveedor
      (véase [`garrucha-vera-scope.md`](garrucha-vera-scope.md)).
- [ ] Transición visual entre niveles: hoy cada salto es una carga completa.

## Explotación

La recomendación es **vender a ayuntamientos y patronatos de turismo**, no al
veraneante.

- [ ] **Licencia municipal.** Es lo que mejor encaja: ya se produce justo lo que
      un ayuntamiento querría publicar —su costa como maqueta interactiva con su
      bandera oficial, empotrable en la web municipal— y Mojácar ya paga por un
      widget mucho peor. No depende del tráfico, que es el punto débil actual; el
      coste marginal de una costa nueva es bajo porque el pipeline está escrito;
      y **resuelve el problema legal**, porque el dueño del dato de banderas
      pasa a ser quien paga. Modelo: implantación más cuota anual.
- [ ] **Alojamiento frente a costa** —hoteles, apartamentos, campings—. «Esta
      terraza tiene sol hasta las 20:40» es argumento de venta, y es un cálculo
      propio, no de una API meteorológica.
- [ ] **Láminas impresas**, como experimento barato. La maqueta isométrica
      funciona como póster, es impresión bajo demanda y no necesita
      infraestructura. Ingresos pequeños, esfuerzo casi nulo, refuerza la marca.
- [ ] **API de sombra orográfica** para terceros —portales inmobiliarios,
      turismo—. Nicho, pero real.

Descartado a propósito:

- **Suscripción de consumidor.** Información estacional, de uso puntual y con
  sustitutos gratis. No se paga.
- **Publicidad y afiliación.** No son viables sin SEO, y chocan con algo que el
  proyecto defiende bien: que observación, previsión y derivación nunca
  comparten semántica visual. Un chiringuito patrocinado ensucia esa jerarquía.

### Antes de cobrar un euro

- [ ] **Auditoría de licencias.** MDT02 del IGN, DERA, IHM, Catastro, CORINE y
      OSM tienen condiciones distintas. La espinosa es OSM: ODbL, con obligación
      de compartir en obras derivadas de la base de datos. Para producto impreso
      se puede prescindir del viario OSM sin perder casi nada; para producto web
      hay que mirarlo en serio.
- [ ] **Acuerdo o sustitución de la fuente de banderas.** Raspar un proveedor
      comercial ajeno dentro de un producto de pago es un riesgo real.
- [ ] Mantener igual de visibles los avisos actuales —la bandera es una
      observación, no una garantía de servicio—. Cobrar sube la expectativa de
      fiabilidad y con ella la responsabilidad.

## Lo que está bien y no hay que tocar

Conviene dejarlo escrito para que nadie «arregle» una decisión buena:

- **`createScene` se apoya en `createStage`**, no lo duplica. La jerarquía de
  escena está bien construida y admite los cuatro niveles sin ramificarse.
- **Las 36 fichas JSON no son plantilla**: solo 5 de 24 campos tienen el mismo
  valor en todas. Es configuración real, y se valida con Zod al cargar.
- **El 7 % de comentario explica el *porqué*, no el *qué***: por qué el estrato
  crece con el bloque, por qué las paredes no reciben sombra, por qué la lámina
  de agua no se tesela sobre tierra. Eso es raro y vale mucho.
- **`docs/` está muy por encima de la media**, incluido lo que dice que *no*
  está comprobado. Mantener esa costumbre.

## Orden sugerido

1. ~~Commitear lo pendiente y montar el CI.~~ Hecho el 03-08-2026.
2. ~~`as unknown as` e inversión de capas.~~ Hecho el 04-08-2026.
3. Recorrido con scroll y arranque común.
4. Pruebas de `beachZones`.
5. Shaders fuera de `sea.ts` y troceado del bundle.

Del 2 al 5 es aproximadamente un día de trabajo. El prerender de las fichas es
lo siguiente, porque es requisito de cualquier vía que dependa de tráfico y
además mejora el rendimiento.
