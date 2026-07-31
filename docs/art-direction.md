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

En costas no monótonas, como los espigones de Lance Nuevo y Venta del Bancal,
se conserva la topología DERA mediante una máscara poligonal. Las obras
litorales se muestran como prismas minerales simplificados y las rompientes se dividen a ambos lados;
no se fuerza el litoral a una única coordenada X por cada Y.

## Variante Mediterráneo ilustrado

Lance Nuevo funcionó como banco de pruebas de una variante más expresiva,
activada declarativamente con `visualStyle: mediterranean-illustrated`. Tras
su validación, la misma variante se aplica a las siete playas mediante
configuración, sin duplicar lógica de escena.

La variante incorpora:

- gradiente litoral de menta a azul petróleo calculado por distancia a DERA;
- agua volumétrica y una franja de reflejo orientada por el azimut solar real;
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

## Overview de la costa

La ruta `/coast/` usa el mismo lenguaje como una maqueta municipal continua.
El terreno y las masas urbanas se generalizan para que la costa completa siga
siendo legible. Las franjas de selección conservan centro y longitud derivados
de DERA, pero exageran su anchura; su tinte expresa estado observado, no área
legal de baño. Las juntas transversales oscuras son una separación gráfica
deliberada entre playas contiguas, no límites administrativos. El modo
`?demo=1` solo sirve para revisar la paleta.

El overview se presenta deliberadamente más cerca que un encuadre de mapa. Se
puede recorrer mediante arrastre y ampliar con rueda o gesto de pinza, pero la
rotación permanece bloqueada para conservar la composición isométrica. Los
rótulos se anclan ligeramente mar adentro y miran siempre a cámara.

La entrada usa el scroll como línea de tiempo de cámara y elimina toda interfaz
superpuesta salvo los rótulos integrados en la propia maqueta. Parte del conjunto,
aproxima hasta Marina de la Torre y recorre las siete playas hasta Venta del
Bancal en unas tres pantallas de desplazamiento. Solo existen cuatro encuadres
editoriales: general, norte, centro y sur. La cámara interpola tanto entre esos
keyframes como entre los impulsos de scroll; el movimiento es reversible.
En dispositivos que solicitan movimiento reducido cambia entre encuadres discretos.
El documento usa paradas de scroll obligatorias y redondea siempre al keyframe
más cercano: no existe un estado persistente con zoom arbitrario entre escenas.

## MVP de viento

Las siete playas comparten un glifo 3D flotante y separado del chunk.
Open-Meteo expresa la dirección meteorológica de procedencia; el render
invierte ese azimut para orientar el símbolo hacia el destino geográfico. La
orientación de la costa clasifica el resultado como `de mar`, `de tierra` o
`lateral`.

El glifo combina un pedestal cúbico de estética toon, una rosa pizarra de alta
resolución y una manga de viento naranja volumétrica. Anillo, marcas y cardinales comparten una
sola superficie horizontal para que las letras permanezcan integradas. El pedestal conserva la
referencia espacial, adapta su paleta a la altura solar y solo gira la manga,
que se extiende hacia el destino del flujo meteorológico. Su malla de alta densidad mantiene la silueta suave; el
color diferencia la relación con la costa y un pulso leve expresa velocidad y rachas. Se renderiza en un canvas transparente
pequeño anclado abajo a la derecha, por lo que no tapa la playa, conserva tamaño
al cambiar la cámara y sigue siendo legible en móvil. No pretende modelar
turbulencia, edificios ni canalización orográfica. Con movimiento reducido el
glifo queda estático. El selector de depuración permite ocultarlo.

## MVP de oleaje direccional

Marina de la Torre es el caso base por su tramo litoral prácticamente recto.
La dirección de procedencia entregada por Open-Meteo se transforma en un vector
geográfico de avance. Ese vector gobierna fase, pendiente y desplazamiento de
las crestas volumétricas; la distancia a la costa sigue limitando la zona de
rompiente y evita trasladar agua sobre la arena. La tarjeta muestra el rumbo
usado para facilitar la validación al cambiar de hora. Las otras playas
conservan temporalmente el movimiento genérico hasta validar estos dos casos.
En Lance Nuevo, el extremo mar adentro se deriva de la geometría DERA del
espigón. Desde ese punto se calcula una estela dinámica en la dirección de
avance del oleaje: reduce progresivamente volumen y espuma a sotavento y se
disipa con la distancia. Es una abstracción visual de apantallamiento, no un
modelo de difracción o refracción.
