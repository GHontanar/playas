# Carboneras: alcance y correspondencia de playas

Fecha de comprobación: 31 de julio de 2026.

El segundo municipio reutiliza el mismo motor, pipeline y lenguaje visual de
Mojácar. La portada experimental se abre en
`/coast/?municipality=carboneras`; cada zona enlaza con su ficha en
`/terrain/?beach=<id>`.

## Dos inventarios, una decisión explícita

El Catálogo General de Playas de Andalucía contiene doce entidades en
Carboneras: El Ancón, La Galera, Las Marinicas, Los Barquicos-Los Cocones, El
Algarrobico, Los Muertos, El Corral, Cala Sorbas, Cala Castillo, Cala Arena, La
Puntica y Las Salinicas. Sus extremos y longitudes oficiales se conservan como
fuente de delimitación; no se han dibujado playas a mano.

La web operativa de Protección Civil de Carboneras publica puestos para siete
unidades compatibles con ese catálogo. Son las que tienen ficha en este corte:

| Unidad del producto | Correspondencia operativa |
|---|---|
| El Ancón | cuatro puestos `Playa El Ancón` |
| Los Barquicos-Los Cocones | agrega Barquicos y Cocones; manda la bandera más restrictiva |
| Las Marinicas | cuatro puestos `Playa Las Marinicas` |
| La Puntica | un puesto |
| Los Muertos | figura expresamente sin socorrismo |
| El Algarrobico | figura expresamente sin socorrismo |
| El Corral | un puesto |

La Galera, Las Salinicas y las tres calas siguen en el inventario oficial pero
no se presentan como si tuvieran bandera observada. Podrán añadirse como zonas
sin servicio cuando exista una navegación municipal que explique esa
diferencia sin ambigüedad.

## Estado observado

`/api/status?municipality=carboneras` lee el array publicado por Protección
Civil, convierte 1/2/3 a roja/amarilla/verde y agrega los puestos por playa. El
horario publicado es 11:00–20:00. Los Muertos y El Algarrobico permanecen sin
servicio aunque el mapa municipal muestre una condición de baño. La página no
publica una hora de observación: el cliente no inventa una y solo conserva la
hora de consulta del proxy.

Fuente operativa:
<https://www.proteccioncivilcarboneras.es/salvamento_playas.php>.

## Límites actuales

- La fuente se denomina `salvamento_playas_banderas_2026.php`; una nueva
  temporada requerirá verificar su URL y calendario.
- La bandera es una observación municipal; meteorología y mar continúan siendo
  previsiones de Open-Meteo claramente separadas.
- La agrupación Barquicos-Cocones sigue la entidad oficial conjunta y puede
  ocultar diferencias entre sus puestos; se muestra siempre el peor estado.
- Cala Arena, Cala Castillo y Cala Sorbas son demasiado pequeñas para justificar
  todavía un chunk independiente y no tienen dato operativo publicado.

