/**
 * Comprime una imagen en el cliente solo si es extremadamente pesada.
 * Ajustado para "Calidad Original" según requerimiento del usuario.
 */
export const compressImage = (file, options = {}) => {
  const { 
    maxWidth = 4000, // Muy alto para mantener resolución de impresión
    quality = 0.9,    // Calidad casi máxima
    skip = false      // Opción para saltar
  } = options;

  return new Promise((resolve, reject) => {
    // Si el archivo es menor a 8MB o no es imagen, no tocar nada
    if (skip || !file.type.startsWith('image/') || file.size < 1024 * 1024 * 8) {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((maxWidth / width) * height);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            // Solo usar si realmente baja el peso significativamente
            resolve(compressedFile.size < file.size ? compressedFile : file);
          } else {
            resolve(file); // En caso de duda, devolver original
          }
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
};
