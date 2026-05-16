// Zebra Browser Print API integration
const ZEBRA_API_URL = 'http://localhost:9100/write'; // Default local Zebra Browser Print URL

export const printZPL = async (zplContent) => {
  try {
    const response = await fetch(ZEBRA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: zplContent,
    });

    if (!response.ok) {
      throw new Error(`Failed to print: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('Error printing ZPL:', error);
    // Alternatively, fallback to downloading the ZPL as a file if the printer isn't connected
    const blob = new Blob([zplContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `label-${Date.now()}.zpl`;
    a.click();
    URL.revokeObjectURL(url);
    
    throw error;
  }
};
