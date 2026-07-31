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
- zócalo malva sencillo, sin estratos fotorrealistas;
- costa y playa como protagonistas, sin etiquetas, POI ni mobiliario.

La variedad de color de los edificios se asigna de forma determinista desde su
identificador catastral. No codifica uso, calidad ni estado del inmueble.

## Mar animado

El oleaje es deliberadamente ilustrativo, no una simulación física ni una
representación del estado observado. El plano subdividido del mar se deforma en
la GPU mediante dos trenes de onda. Sus crestas de espuma se construyen desde la
línea de costa DERA y avanzan mar-tierra, perpendicularmente a cada tramo del
litoral, con tres presets:

- `calm`: trazos más separados, tenues y lentos;
- `moderate`: estado visual predeterminado;
- `rough`: mayor densidad, contraste y velocidad.

Cambiar el preset no reconstruye geometría ni descarga datos. Con
`prefers-reduced-motion`, la superficie y las rompientes permanecen estáticas.

El microdetalle usa `mediterranean-waves-normal.webp`, un normal map original
generado para el proyecto y optimizado a 512 × 512 (59 KB). Se muestrea dos
veces, a distinta escala y dirección, para evitar el aspecto de una lámina lisa
o de un patrón único repetido.

La escala de las olas es expresiva, no métrica. Longitud, altura y anchura de
espuma están exageradas deliberadamente para que el oleaje sea legible desde la
cámara isométrica y en pantallas móviles.

La superficie se recorta en el shader con la envolvente marina de la línea
DERA. Las rompientes se limitan mediante los extremos oficiales de cada playa,
se suavizan a partir de puntos DERA y conservan un margen mar adentro antes de
disiparse. Así, puertos y ramales vecinos no crean espuma cruzada sobre arena.

En costas no monótonas, como el espigón de Lance Nuevo, se conserva la
topología DERA mediante una máscara poligonal. Las obras litorales se muestran
como prismas minerales simplificados y las rompientes se dividen a ambos lados;
no se fuerza el litoral a una única coordenada X por cada Y.
