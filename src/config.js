// Archivo de configuración para servicios externos
export const CONFIG = {
  // Nueva URL de la implementación (Versión Super Robusta)
  GOOGLE_DRIVE_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxG-t-eZbugxmvXxCBdh55Ugym_GPlmgvqPMlcb1DXIQQhgSXznPehSON7ibgjYwBSFnA/exec",
  
  // ID de la carpeta de Drive: fungitrack
  GOOGLE_DRIVE_FOLDER_ID: "1cr19_4UGB8MFOCZNg4wqam0erd_DkwFC",

  // Gemini Flash API (Asistente de Voz)
  // Configurar en .env: VITE_GEMINI_API_KEY=tu_key
  GEMINI_API_KEY: import.meta.env.VITE_GEMINI_API_KEY || '',
};
