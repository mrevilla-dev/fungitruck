const OLLAMA_URL = 'http://localhost:11434';
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.0-flash';
const OLLAMA_MODEL = 'llama3.2:3b';

let ollamaAvailable = null;
let lastCheck = 0;
const CHECK_INTERVAL = 30000;

async function checkOllama() {
  const now = Date.now();
  if (ollamaAvailable !== null && now - lastCheck < CHECK_INTERVAL) {
    return ollamaAvailable;
  }
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    });
    ollamaAvailable = res.ok;
  } catch {
    ollamaAvailable = false;
  }
  lastCheck = now;
  return ollamaAvailable;
}

async function callOllama(prompt, context) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: context },
        { role: 'user', content: prompt }
      ],
      stream: false
    })
  });
  if (!res.ok) throw new Error('Ollama error');
  const data = await res.json();
  return data.message?.content || '';
}

async function callGemini(prompt, context) {
  if (!GEMINI_API_KEY) throw new Error('Gemini API key no configurada');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `${context}\n\n${prompt}` }]
      }]
    })
  });
  if (!res.ok) throw new Error('Gemini error');
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function askLLM(userPrompt, firestoreContext = '') {
  const systemContext = `Sos el asistente de FungiTrack, un sistema de gestión de laboratorio de micología.
Respondé en español, de forma concisa y útil.
Si no sabés algo, decilo honestamente.
Contexto actual de Firestore:
${firestoreContext}`;

  const useOllama = await checkOllama();

  try {
    if (useOllama) {
      return await callOllama(userPrompt, systemContext);
    } else {
      return await callGemini(userPrompt, systemContext);
    }
  } catch (err) {
    try {
      if (useOllama) {
        return await callGemini(userPrompt, systemContext);
      } else {
        return await callOllama(userPrompt, systemContext);
      }
    } catch {
      return '❌ No pude conectar con ningún modelo de IA. Verificá que Ollama esté corriendo o que la API key de Gemini esté configurada.';
    }
  }
}

export function getBackendStatus() {
  return checkOllama().then(available => ({
    ollama: available,
    gemini: !!GEMINI_API_KEY,
    active: available ? 'Ollama (local)' : (GEMINI_API_KEY ? 'Gemini (cloud)' : 'Ninguno')
  }));
}
