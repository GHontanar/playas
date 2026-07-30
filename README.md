# Estado de las playas · Mojácar

Página estática de una sola vista con el estado de las banderas (verde / amarilla / roja)
y el aviso de medusas de las playas de Mojácar.

Lee los banners directamente de `gestiondeplayas.com`, el proveedor que alimenta la web
del ayuntamiento, en lugar de depender del widget de
[mojacar.es](https://www.mojacar.es/mojacar-disfruta/estado-de-las-playas/).

## Uso

Es un único `index.html` sin dependencias ni build. Ábrelo en el navegador o sírvelo
como estático.

El estado oficial se actualiza una vez al día (aprox. 9 abr – 9 oct, franja 11:30–11:45),
así que la página no auto-refresca: carga al abrir y vuelve a pedir los banners solo al
pulsar «Actualizar».

## Proxy opcional

Si los banners aparecen como «sin señal» (bloqueo por hotlink, CORS o sandbox), hay que
pasar las peticiones por un Worker de Cloudflare y poner su URL en la constante `PROXY`
de `index.html`.

## Despliegue

Cloudflare Pages, sin build command y con el directorio de salida en la raíz (`/`).

Emergencias: **112**.
