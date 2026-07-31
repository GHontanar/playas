# Garrucha y Vera: alcance y fuentes operativas

Fecha de comprobación: 1 de agosto de 2026.

## Inventario oficial

Los chunks usan los extremos ETRS89 / UTM 30N del Catálogo General de Playas
de Andalucía, no delimitaciones dibujadas:

- Garrucha: Playa de Garrucha (702 m), Pósito Garrucha (261 m) y Playazo
  Garrucha (112 m).
- Vera: Las Marinas-Bolaga (1.350 m), Puerto Rey (1.330 m), El Playazo
  (2.040 m) y Cala Marqués (200 m).

Las vistas municipales son `/coast/?municipality=garrucha` y
`/coast/?municipality=vera`. Las siete fichas usan los mismos sombreadores,
cámara ortográfica, materiales, agua volumétrica, viento y cálculo solar que
Mojácar y Carboneras.

## Garrucha y el puerto

El puerto rompe la continuidad visual del litoral. La línea DERA contiene
varias geometrías de tipo `Mar` que corresponden a sus contornos y espigones.
Los identificadores `10125300001430`, `10125300000252` y
`10125300001431` se declaran como estructuras costeras según el recorte. Así el
mar conserva la costa real y las rompientes no atraviesan el puerto como si
fuera arena.

## Bandera diaria

En la fecha de comprobación no se encontró en las webs municipales de Garrucha
o Vera un feed público, estable y reproducible con la bandera observada de cada
playa. Las páginas describen el servicio de socorrismo y el significado de las
banderas, pero eso no constituye una observación diaria.

Por ello `/api/status?municipality=garrucha` y `?municipality=vera` devuelven
estado desconocido de forma explícita. La maqueta no colorea las zonas y las
fichas muestran “Bandera no disponible”. Esta decisión evita heredar por error
el estado de Mojácar o confundir una Bandera Azul de calidad con la bandera de
baño.

Fuentes comprobadas:

- Ayuntamiento de Garrucha, ficha municipal de playas:
  <https://www.garrucha.es/Servicios/cmsdipro/index.nsf/playas.xsp?documentId=F241F70033B27718C1258417004AF7AE&p=Garrucha>
- Ayuntamiento de Vera, información de playas:
  <https://www.vera.es/turismo/index.php?page=playas&subpage=info>

Si posteriormente el ayuntamiento publica un feed, solo será necesario añadir
un adaptador municipal al proxy. El catálogo, las zonas y las fichas ya usan
identificadores independientes de la fuente de estado.

