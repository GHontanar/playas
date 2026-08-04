# Barreiros: alcance e implementación

Fecha de comprobación: 2 de agosto de 2026.

Barreiros (Lugo, A Mariña) replica el modelo vigente —vista de costa
(`/coast/?municipality=barreiros`) más fichas topográficas
(`/terrain/?beach=barreiros-*`)— con el mismo motor, pipeline y lenguaje visual
que los municipios de Almería, adaptado a la costa cantábrica.

## Inventario de playas

Se implementan las **10 playas del catálogo de MeteoGalicia** (la fuente oficial
de praias de la Xunta), con sus identificadores y coordenadas verificadas. El
concello declara 9; MeteoGalicia divide Coto en dos tramos (Pena de Salsa y Area
da Balea):

| Concello (9) | MeteoGalicia (id · lat · lon) |
|---|---|
| Anguieira | `1997` · 43,5636 · −7,2436 |
| Altar | `1996` · 43,5663 · −7,2427 |
| San Bartolo | `1995` · 43,5673 · −7,2331 |
| Acantilado-Remior | `1994` · 43,5652 · −7,2252 |
| Coto (tramo norte) | `1993` Pena de Salsa ou Fontenla · 43,5639 · −7,2148 |
| Coto (tramo sur) | `1992` Area da Balea · 43,5617 · −7,1983 |
| Fontela-Balea | `1991` Benquerencia · 43,5620 · −7,2035 |
| Lóngara (y canina Punta Corveira) | `1990` San Pedro-Lóngara · 43,5611 · −7,1908 |
| A Pasada | `1989` · 43,5611 · −7,1830 |
| Arealonga | `1988` San Miguel de Reinante ou Arealonga · 43,5556 · −7,1732 |

Los identificadores `1901` y `2212` del catálogo se llaman también «de
Barreiros», pero corresponden a otros municipios (Ría de Muros y Ría de
Pontevedra respectivamente); no pertenecen a este litoral.

## Fuentes evaluadas

| Pilar del modelo | Fuente actual (Almería) | Equivalente para Barreiros | Estado |
|---|---|---|---|
| Elevación | MDT02 IGN/CNIG, EPSG:25830 | MDT02 IGN/CNIG, **EPSG:25829** (UTM 29N) | viable |
| Costa | DERA IECA (solo Andalucía) | **Línea de costa IHM** vía CNIG; incluye pleamar y bajamar | viable |
| Extensión de playas | DERA `T05_10_Playa` | MITECO, capa `playas` del deslinde DPMT / Guía de playas | viable |
| Edificios | Catastro INSPIRE Buildings | Catastro INSPIRE `27005-BARREIROS` | verificado |
| Calles | OSM Overpass | OSM Overpass (nacional) | viable |
| Clima y oleaje | Open-Meteo | Open-Meteo (global, ya es la fuente de la tarjeta) | viable |
| Sol y sombra | SunCalc + shadow map | Idéntico | viable |
| Predicción de playas y mareas | — | MeteoGalicia `praias/predicion` | verificado |
| Bandera observada | gestiondeplayas.com | **Sin feed diario público** | no disponible |

### Elevación

MDT02 cubre toda España a 2 m. Barreiros cae en el huso **29** (meridiano
central −9°): las coordenadas del edificio catastral de descarga (Easting
≈ 639 km) lo confirman. El pipeline actual hardcodea EPSG:25830 en
`scripts/prepare_dem.py`, `scripts/prepare_coastline.py` y
`scripts/prepare_urban.py`, y en los `bounds` de cada JSON. Replicar exige
**generalizar el huso a configuración por municipio**; es trabajo acotado, no
bloqueante.

### Costa

DERA es exclusiva de Andalucía. Para Barreiros la línea oficial nacional es la
**Línea de costa del Instituto Hidrográfico de la Marina**, distribuida por el
CNIG: shapefile ETRS89 a 1:50.000 (34,52 MB, 14-10-2022), de uso libre y
gratuito con la cita «© Instituto Hidrográfico de la Marina»
(<https://centrodedescargas.cnig.es/CentroDescargas/linea-costa>). El producto
es una **línea doble: pleamar y bajamar**, lo que resulta doblemente útil para
el rango de marea (véase `docs/tide-model.md`). Existe además un WFS INSPIRE
(`spaihmwfs_regionesmarinas_costa`) con `coastline`, `shoreline` y
`shoresegment`. La geometría llega en coordenadas geográficas y habría que
reproyectarla a EPSG:25829 durante el pipeline.

### Extensión de playas

El Catálogo de Playas de Andalucía (DERA `T05_10_Playa`) no existe en Galicia.
La capa nacional equivalente son las **playas del deslinde del Dominio Público
Marítimo Terrestre** del MITECO (capa `playas` del Visor DPMT) o el catálogo de
la Guía de playas, que aportan centro, extremos y longitudes oficiales por
playa. La correspondencia entre el inventario del concello y las entidades del
deslinde queda pendiente de resolver en implementación.

### Edificios

Se verificó la descarga real del servicio INSPIRE de Catastro:
`27005-BARREIROS` devuelve `A.ES.SDGC.BU.27005.buildingpart.gml` (≈ 30 MB,
23.446 geometrías, EPSG:25829). Nota: el código catastral es **27005**, no el
`27006` del INE; probar con el INE devuelve la página de error del portal.
Misma fuente y misma licencia que los municipios actuales.

### Predicción de playas y mareas

El API público de MeteoGalicia
(`https://apis-ext.xunta.gal/meteo2api/v1/api/praias/predicion?idPraia=1994&idioma=gl`)
funciona con la clave de suscripción embebida en la SPA de meteogalicia.gal
(cabecera `apikey`, producto `METEO2_API`). Para Remior devuelve temperatura del
agua, cielo, lluvia, viento, agitación del mar, UV y **mareas del puerto de
referencia «Ría de Foz» con alturas de 0,8–4,0 m**. Es un endpoint no
documentado y sin garantías de estabilidad: si se integra, debe quedar aislado
en un adaptador como el que ya usa `/api/status`.

### Bandera observada

No se encontró ningún feed público, estable y reproducible con la bandera de
baño observada: ni el concello
(`concellodebarreiros.gal` y su portal turístico `barreirosturismo.gal`,
que solo publican fichas descriptivas y una tabla de mareas en PDF), ni
MeteoGalicia (su predicción no incluye bandera), ni AEMET (predicción, no
observación). Los portales que muestran «bandera hoy» para estas playas son
**estimaciones** por oleaje y viento, no observaciones municipales.

Por ello el estado seguiría el precedente de Garrucha y Vera
(`docs/garrucha-vera-scope.md`): `/api/status` devolvería estado desconocido de
forma explícita, la maqueta no colorearía zonas y las fichas mostrarían
«Bandera no disponible». Se conservaría solo el cruce con el calendario de
socorrismo (temporada ≈ 15 jun – 15 sep según el dispositivo de salvamento del
concello). Las banderas azules de Coto, A Pasada y Acantilado-Remior son un
distintivo de calidad, no la bandera de baño diaria, y no deben mezclarse.

## Adaptaciones del modelo

- **Huso UTM 29N**: el pipeline, el esquema y la verificación se generalizaron
  para aceptar `EPSG:25830` y `EPSG:25829`. Las hojas MDT02 de Galicia llegan
  en parte etiquetadas como EPSG:3041 (alias «N-E» de UTM 29N con píxeles E-N);
  `scripts/prepare_dem.py` normaliza ese alias antes del merge.
- **Orientación norte**: el modelo solo soportaba costa con mar al este u
  oeste. `seaSide` admite ahora `east | west | north | south`; la orientación se
  abstrae en `alongOf`/`crossOf`/`recompose` en `src/map/coastalOrientation.ts`
  y se generalizaron mar, rompientes, zonas de playa y la verificación.
- **Costa IHM**: en lugar de DERA (solo Andalucía) se usa la Línea de costa del
  Instituto Hidrográfico de la Marina (COALNE/PLEAMAR). La extracción descarta
  anillos cerrados (islas/rocas) y fragmentos minúsculos, que rompían la
  envolvente marina.
- **Máscara de inundación**: la ría de Foz y los islotes hacen fallar la
  envolvente única; las configuraciones de Barreiros usan `useFloodMask`, que
  clasifica mar/tierra inundando desde el borde marino (el mismo mecanismo que
  los puertos de Garrucha). El relleno se restringe por cota del MDT (2,5 m): la
  línea de costa IHM llega fragmentada en tramos con huecos, y un relleno
  incondicionado se filtraba e inundaba la tierra.
- **Región**: el subtítulo de la vista de costa dejó de estar hardcodeado como
  «Levante de Almería»; cada municipio declara su región en el catálogo.

## Estado observado

Sin feed diario público, `/api/status?municipality=barreiros` devuelve estado
desconocido de forma explícita (precedente de Garrucha y Vera): la maqueta no
colorea zonas y las fichas muestran «Bandera no disponible». La marea (carrera
~4 m) no se modela; véase `docs/tide-model.md`, pendiente de implementar.

## Regeneración

```sh
scripts/download-barreiros.sh
npm run data:beach -- barreiros-remior   # una playa, o cada id
npm run verify:assets
```

Los configs se generan con `npx tsx scripts/scaffold-barreiros.ts`.

## Límites actuales

- La bandera es desconocida: no se debe confundir la Bandera Azul (distintivo de
  calidad) con la bandera de baño diaria.
- La línea de costa es la pleamar IHM (1:50.000); sin marea, la orilla no
  cambia con la hora del día.
- Las playas usan los nombres y tramos del catálogo de MeteoGalicia; el concello
  agrupa Coto como una sola playa.
- La costa IHM y la ría conservan el resto de geometrías (puentes, ríos) fuera
  del renderer; solo COALNE/PLEAMAR alimenta la maqueta.
