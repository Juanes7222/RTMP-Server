/**
 * Medidor de fotogramas por segundo.
 *
 * NodeMediaServer solo expone los fps que el publicador declara en
 * `onMetaData`, y OBS a veces los omite (el panel mostraba 0 fps con el
 * stream a plena velocidad). Contar los paquetes de video y dividir entre el
 * tiempo transcurrido da la tasa efectiva.
 */
export function createFrameRateMeter() {
  let frames = 0;
  let since = null;

  return {
    /** Suma un fotograma al intervalo en curso. */
    count() {
      frames += 1;
    },

    /** Reinicia la cuenta y toma `now` como base del siguiente intervalo. */
    reset(now = Date.now()) {
      frames = 0;
      since = now;
    },

    /**
     * Devuelve los fps del intervalo cerrado y abre el siguiente.
     * @param {number} now
     */
    sample(now = Date.now()) {
      if (since === null) {
        since = now;
        return 0;
      }

      const elapsed = (now - since) / 1000;
      const counted = frames;
      frames = 0;

      // Reloj hacia atrás (ajuste de hora): se descarta el intervalo.
      if (elapsed <= 0) {
        since = now;
        return 0;
      }

      since = now;
      return Math.round(counted / elapsed);
    },

    get pendingFrames() {
      return frames;
    },
  };
}
