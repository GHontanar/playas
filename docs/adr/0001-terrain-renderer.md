# ADR 0001: malla Three.js para la maqueta solar

Estado: aceptado, 30-07-2026.

## Contexto

El requisito diferenciador no es solo relieve 3D o hillshade: el terreno debe
proyectar sombra física con un vector solar arbitrario y actualizarla sin
descargas.

## Opciones evaluadas

### A. `raster-dem` de MapLibre

Es la preparación más estándar y facilita georreferencia y cámara. Tiene buen
LOD móvil, pero el hillshade es una textura analítica y no una sombra
proyectada. El terreno estándar no expone una luz direccional con shadow map
capaz de producir la ocultación horaria requerida. La cámara tampoco es
ortográfica verdadera.

### B. Malla propia Three.js

La malla visible Float32 de 180 × 340 se convierte en 61.200 vértices y
121.362 triángulos. Una segunda malla de baja resolución, invisible en color
pero activa en el shadow map, conserva el relieve exterior. Three.js proporciona
cámara ortográfica, materiales, recorte,
exageración y `DirectionalLight` con sombras. La transformación EPSG:25830 a
ejes locales es directa. Su coste es implementar el LOD y la superposición
vectorial, asumible para siete chunks pequeños y fijos.

### C. MapLibre + capa Three.js

Conserva el ecosistema cartográfico, pero obliga a sincronizar cámaras,
matrices, profundidad y ciclos de render de dos motores. Para una maqueta fija
no aporta una ventaja que compense esa complejidad.

## Decisión

Usar **B, Three.js independiente**, después de comprobar la insuficiencia de A.
No se introduce MapLibre en este vertical slice porque no hay mapa base,
navegación ni etiquetas que lo justifiquen. El resultado sigue siendo
geográfico: configuración, malla y vectores permanecen en EPSG:25830.

El shadow map es 1536² en escritorio y 1024² en móvil, limitado a 1,75 de pixel ratio.
Cambiar la hora solo mueve la luz: no reconstruye geometría ni descarga datos.
El frustum se dimensiona con la diagonal del caster, su desplazamiento respecto
a la pieza visible y la distancia de 8 km de la luz; no con el tamaño del chunk
visible.

La cámara es ortográfica con elevación isométrica exacta de 35,264° y azimut
diagonal de 45° (135° desde el norte, lado opuesto al encuadre inicial). El roll es cero para que la vertical de
pantalla coincida con la vertical 3D y la superficie se lea como horizontal.
La pieza incorpora cuatro caras perimetrales que siguen las alturas del MDT y
una base a 90 m de profundidad; al cambiar la exageración se actualiza el borde
superior sin desplazar el fondo.

## Consecuencias

Para siete playas se generará un asset/config por playa y se reutilizarán escena,
Sol y controles. Si más adelante se añade navegación geográfica continua,
MapLibre puede envolver la selección de playa sin migrar las maquetas.
