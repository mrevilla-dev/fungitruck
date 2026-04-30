import { CONFIG } from '../config';

/**
 * Sube un archivo a Google Drive a través de un proxy de Google Apps Script.
 * @param {File} file - El archivo a subir.
 * @param {Function} onProgress - Callback para el progreso.
 * @returns {Promise<Object>} - El ID y la URL de visualización del archivo.
 */
export const uploadFileToDrive = async (file, onProgress) => {
  if (!CONFIG.GOOGLE_DRIVE_SCRIPT_URL || CONFIG.GOOGLE_DRIVE_SCRIPT_URL === "https://script.google.com/macros/s/.../exec") {
    throw new Error("La URL de Google Apps Script no es válida o no ha sido configurada.");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = async () => {
      try {
        const base64 = reader.result.split(',')[1];
        const payload = {
          name: file.name,
          mimeType: file.type,
          base64: base64,
          folderId: CONFIG.GOOGLE_DRIVE_FOLDER_ID
        };

        if (onProgress) onProgress(40);

        // AbortController para manejar timeouts
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 segundos de timeout

        try {
          const response = await fetch(CONFIG.GOOGLE_DRIVE_SCRIPT_URL, {
            method: 'POST',
            // NO enviamos application/json para evitar el preflight OPTIONS
            headers: {
              'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (onProgress) onProgress(90);

          if (!response.ok) {
            throw new Error(`Error del servidor: ${response.status}`);
          }

          const result = await response.json();
          
          if (result.error) {
            throw new Error(result.error);
          }

          if (onProgress) onProgress(100);
          resolve(result);
        } catch (fetchErr) {
          if (fetchErr.name === 'AbortError') {
            throw new Error("Tiempo de espera agotado. La imagen puede ser muy pesada o el script está lento.");
          }
          throw fetchErr;
        }
      } catch (err) {
        console.error("Error en uploadFileToDrive:", err);
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error("Error al leer el archivo local"));
  });
};
