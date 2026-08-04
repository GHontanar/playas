# Navegación

La aplicación tiene cuatro niveles. Cada uno enseña la misma maqueta a una
escala distinta, con el mismo rumbo (45°), la misma elevación de cámara (32°) y
el mismo cielo por hora, para que bajar un nivel se lea como acercarse y no como
abrir otra cosa.

| Nivel | Ruta | Qué enseña | Rejilla |
|---|---|---|---|
| Índice | `/` | Las comarcas disponibles, cada una en miniatura | 400 m |
| Comarca | `/region/?region=<id>` | Toda la costa de la comarca, con los municipios rotulados | 50 m |
| Costa | `/coast/?municipality=<id>` | El litoral de un municipio y sus zonas de baño | 20 m |
| Playa | `/terrain/?beach=<id>` | Una playa con Sol, sombra, edificios, calles y previsión | 2,5 m |

`/coast/` sin parámetros abre Mojácar y `/region/` sin parámetros abre el
Levante: un identificador desconocido cae en el primero del catálogo en vez de
fallar. Las rutas son estables y compartibles; ningún nivel guarda estado fuera
de la URL.

La portada histórica de banderas se conserva archivada en `/flags/`, sin enlaces
desde la aplicación.

## Bajar y subir

Bajar de nivel se hace sobre la maqueta: los rótulos de municipio en la comarca
y las franjas de playa en la costa. Son picados con el ratón sobre el lienzo,
así que no son alcanzables con el teclado ni anuncian a dónde llevan. Por eso
cada nivel repite la misma navegación en HTML:

- **migas de pan** (`.scene-nav`) arriba a la izquierda, con la ruta completa
  hasta el índice. En las maquetas van sobre el cielo y heredan la tinta que el
  script elige según la luz de la hora; en la ficha de playa, sobre el papel
  claro de la cabecera;
- **fichas hermanas** (`.scene-siblings`) al pie del nivel municipal: las otras
  costas de la comarca, con la actual marcada y sin enlazar. Ahí no repiten
  nada, porque la maqueta municipal solo enseña sus propias playas;
- **selector de playa** en la ficha, agrupado por municipio.

En el nivel comarcal esas mismas fichas sí repetían los rótulos de la maqueta,
así que no se pintan: quedan fuera de pantalla y solo asoman al llegar con el
tabulador, que es la vía que el lienzo no ofrece.

Un rótulo comarcal solo enlaza si su municipio está en el catálogo. Los demás
—Villaricos, Las Negras, Viveiro, Ribadeo— se rotulan con el nombre a secas y
sin chevron: el nivel comarcal debe enseñar la cobertura que hay, no insinuar la
que falta.

Todo eso lo genera `src/nav/breadcrumb.ts` a partir de los dos catálogos, así
que un municipio nuevo aparece en las cuatro navegaciones sin tocarlas.

## Los dos catálogos

`src/regions/catalog.ts` describe la comarca: recorte, centro para el Sol,
dirección de mar abierto, lugares rotulados y paradas del recorrido.
`src/beaches/catalog.ts` describe municipios y playas, y cada municipio declara
su `regionId`. El enlace entre los dos niveles es esa clave, y
`tests/navigation.test.ts` comprueba que ninguna quede colgando: cada municipio
en una comarca declarada, cada costa con maqueta rotulada en la suya, cada
parada del recorrido sobre anclas que existen.

## Las miniaturas del índice

El índice es la maqueta y su nombre, en una rejilla de dos columnas que admite
un 2×2 en cuanto haya una tercera comarca. No lleva descripciones: lo que se
elige ahí es un sitio, y cuántas costas y playas trae ya lo cuenta el nivel
comarcal, que está a un clic.

No usa capturas. Monta el mismo bloque comarcal —mismo escenario,
mismo zócalo estratificado, mismo Sol de ahora— con la rejilla diezmada ocho
veces por `scripts/prepare-region-thumbnails.ts`, de 50 m a 400 m por celda. Los
derivados completos pesan 5,6 MB y 4,1 MB y no se pueden pedir dos a la vez en
una portada; diezmados quedan en 130 KB y 94 KB.

El diezmado no promedia sin más: una media aritmética subía las celdas de agua
de la orilla por encima de cero y la inundación desde el borde dejaba de
alcanzarlas, con lo que el mar se cerraba. Cada celda toma la media de la tierra
de su bloque, o cota cero limpia si el bloque era mayoritariamente mar; las
coberturas toman la clase más repetida. Con eso la fracción de mar se conserva
dentro de dos décimas y la cota máxima cae un 2–4 % por el promediado.

Las miniaturas se montan en serie y solo cuando su tarjeta se acerca a pantalla:
cada una pide su rejilla, construye dos mallas y abre su propio contexto WebGL.
Se dibujan una vez, sin bucle de animación.

Regenerar, después de rehacer los derivados comarcales:

```sh
npm run data:thumbnails
npm run verify:assets
```

`verify:assets` comprueba que miniatura y bloque completo cubran los mismos
bounds, que las tres capas de cada rejilla estén alineadas celda a celda y que
la miniatura siga dentro del presupuesto de la portada.
