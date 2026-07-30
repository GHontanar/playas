// Expone el proxy como Pages Function en /api/banner, para que se despliegue con
// la propia página y PROXY pueda ser una ruta relativa (mismo origen, sin CORS).
// La lógica vive en worker/playas-mojacar-proxy.js, que también sirve como Worker suelto.
import worker from "../../worker/playas-mojacar-proxy.js";

export const onRequest = ({ request }) => worker.fetch(request);
