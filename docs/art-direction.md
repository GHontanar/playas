# Dirección artística

La escena adopta un lenguaje de diorama arquitectónico lúdico, inspirado en
maquetas isométricas y juegos de geometría imposible sin reproducir elementos
concretos de ninguna obra.

Principios:

- cámara ortográfica isométrica y vertical de pantalla estable;
- superficies mate con cuatro niveles tonales, sin texturas fotográficas;
- mar turquesa, arena amarilla, calles coral y edificios pastel variados;
- edificios reales reducidos a prismas con un bisel mínimo;
- relieve visible a 2,5 m con una pasada de suavizado para eliminar ruido LiDAR;
- caster orográfico independiente y sin suavizado para preservar la sombra;
- zócalo malva con estratos gráficos amplios, sin fingir geología real;
- costa y playa como protagonistas, sin etiquetas, POI ni mobiliario.

La variedad de color de los edificios se asigna de forma determinista desde su
identificador catastral. No codifica uso, calidad ni estado del inmueble.

## Mar animado

El oleaje es deliberadamente ilustrativo, no una simulación física ni una
representación del estado observado. En Lance Nuevo, el modo predeterminado es
volumétrico: el plano subdividido se eleva en la GPU, comprime la longitud de
onda cerca del litoral, inclina la cresta hacia tierra y recalcula su normal
para que aparezcan caras iluminadas y sombreadas. El desplazamiento nunca baja
del plano marino base, por lo que no descubre el DEM.

La espuma no es una capa independiente en este modo. Se deriva de la altura de
la cresta, su fase, la distancia a costa y una variación bidimensional que
rompe la continuidad del frente. Superficie, volumen y espuma avanzan por tanto
con la misma fase. Hay tres presets:

- `calm`: frentes más separados, bajos y lentos;
- `moderate`: estado visual predeterminado;
- `rough`: mayor densidad, anchura, altura y velocidad.

Cambiar el preset no reconstruye geometría ni descarga datos. Con
`prefers-reduced-motion`, la superficie permanece estática.
El selector de estado y la comparación `Volumétrica / Anterior` se conservan
dentro de Depuración. La API recibe por separado el
estado y su procedencia (`debug`, `official-flag`, `marine-data` o `fallback`)
para que la interfaz final pueda resolverlo desde datos reales sin acoplar el
renderer al sistema de banderas.

El microdetalle usa `mediterranean-waves-normal.webp`, un normal map original
generado para el proyecto y optimizado a 512 × 512 (59 KB). Se muestrea dos
veces, a distinta escala y dirección, para evitar el aspecto de una lámina lisa
o de un patrón único repetido.

La escala de las olas es expresiva, no métrica. Longitud, altura y anchura de
espuma están exageradas deliberadamente para que el oleaje sea legible desde la
cámara isométrica y en pantallas móviles.

La superficie se recorta en el shader con la envolvente marina de la línea
DERA. El volumen y la espuma se amortiguan antes de la costa. En el modo
anterior, conservado solo para comparación, cada cúmulo se contrasta además con
la máscara tierra-mar y los límites del chunk.

En costas no monótonas, como el espigón de Lance Nuevo, se conserva la
topología DERA mediante una máscara poligonal. Las obras litorales se muestran
como prismas minerales simplificados y las rompientes se dividen a ambos lados;
no se fuerza el litoral a una única coordenada X por cada Y.

## Variante Mediterráneo ilustrado

Lance Nuevo funciona como banco de pruebas de una variante más expresiva,
activada declarativamente con `visualStyle: mediterranean-illustrated`. Las
otras seis playas conservan el acabado clásico hasta validar esta dirección.

La variante incorpora:

- gradiente litoral de menta a azul petróleo calculado por distancia a DERA;
- dos escalas del normal map y una franja de reflejo orientada por el azimut
  solar real;
- arena húmeda irregular de 13 m como máximo, siempre hacia tierra;
- paleta mineral dependiente de elevación, pendiente y ruido determinista;
- bloques del espigón con variación pétrea por vértice;
- cubiertas coral, terracota y pizarra separadas de las fachadas;
- calles coral con borde crema;
- fondo, exposición, luz ambiental y luz de relleno dependientes de la altura
  solar;
- tres estratos gráficos en las caras del chunk, borde superior y sombra de
  contacto bajo la maqueta.

No se utiliza ortofotografía ni una textura terrestre fotorrealista. El ruido,
los colores y el brillo se generan en cliente de forma determinista; el normal
map del agua sigue siendo el único bitmap artístico.
