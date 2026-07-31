// Estado semántico agregado para la portada de la costa.
import worker from "../../worker/playas-mojacar-proxy.js";

export const onRequest = ({ request }) => worker.fetch(request);
