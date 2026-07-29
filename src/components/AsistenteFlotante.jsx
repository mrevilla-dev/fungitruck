import { useState, useEffect, useRef, useCallback } from 'react';
import { CONFIG } from '../config';
import toast from 'react-hot-toast';

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export default function AsistenteFlotante() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedFields, setDetectedFields] = useState(null);
  const chatRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!isOpen) {
      setDetectedFields(null);
    }
  }, [isOpen]);

  const addMessage = useCallback((role, text) => {
    setMessages(prev => [...prev, { role, text, timestamp: new Date().toISOString() }]);
  }, []);

  const systemPrompt = `Eres un asistente de laboratorio de micología. Ayudas a registrar datos en FungiTrack.
Cuando el usuario dicta observaciones, extraé los campos estructurados en JSON.
Responde SIEMPRE en español argentino, con un tono profesional pero amable.

Ejemplo de formato de respuesta para dictados:
{
  "action": "dictado",
  "fields": {
    "observaciones": "Micelio blanco, crecimiento rápido",
    "tipo_micelio": "Dicarión",
    "ploidia": "Diploide",
    "contaminacion": false,
    "temperatura": 25,
    "dias_incubacion": 14
  }
}

Para preguntas generales, respondé como un asistente de laboratorio.
Si el usuario saluda o pregunta algo fuera de contexto, respondé amablemente pero orientá la conversación al laboratorio.`;

  const consultarGemini = async (texto) => {
    if (!CONFIG.GEMINI_API_KEY) {
      toast.error('Gemini API key no configurada. Creá un archivo .env con VITE_GEMINI_API_KEY');
      return null;
    }
    try {
      const res = await fetch(`${GEMINI_URL}?key=${CONFIG.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: systemPrompt }, { text: `Usuario: ${texto}` }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
          }
        })
      });
      if (!res.ok) {
        const errData = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${errData}`);
      }
      const data = await res.json();
      const respuesta = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return respuesta;
    } catch (err) {
      console.error('Gemini error:', err);
      toast.error('Error al consultar Gemini: ' + err.message);
      return null;
    }
  };

  const parseGeminiResponse = (text) => {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.action === 'dictado' && parsed.fields) {
          setDetectedFields(parsed.fields);
        }
      }
    } catch {
      // Not JSON — plain text response, leave detectedFields as-is
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    addMessage('user', text);
    setIsProcessing(true);
    const respuesta = await consultarGemini(text);
    if (respuesta) {
      addMessage('assistant', respuesta);
      parseGeminiResponse(respuesta);
    }
    setIsProcessing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Tu navegador no soporta reconocimiento de voz. Usá Chrome o Edge.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-AR';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInputText(transcript);
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.error('Speech error:', event.error);
      toast.error('Error de reconocimiento: ' + event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const confirmarCampos = () => {
    const textoCampos = JSON.stringify(detectedFields, null, 2);
    navigator.clipboard.writeText(textoCampos).then(() => {
      toast.success('Campos copiados al portapapeles');
      addMessage('assistant', '✅ Campos copiados al portapapeles. Pegalos en el formulario correspondiente.');
      setDetectedFields(null);
    }).catch(() => {
      addMessage('assistant', `📋 Campos detectados:\n\`\`\`json\n${textoCampos}\n\`\`\``);
      setDetectedFields(null);
    });
  };

  const descartarCampos = () => {
    setDetectedFields(null);
    addMessage('assistant', 'Campos descartados.');
  };

  return (
    <>
      <button
        className="asistente-flotante-btn"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--primary-color, #3b82f6)',
          color: 'white',
          border: 'none',
          fontSize: '1.5rem',
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s ease',
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        title="Asistente de Voz"
      >
        {isOpen ? '×' : '🤖'}
      </button>

      {isOpen && (
        <div
          className="asistente-panel"
          style={{
            position: 'fixed',
            bottom: '5.5rem',
            right: '1.5rem',
            width: '380px',
            maxWidth: 'calc(100vw - 2rem)',
            height: '520px',
            maxHeight: 'calc(100vh - 8rem)',
            background: 'var(--surface-color, #1e293b)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            zIndex: 9998,
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid var(--border-color, #334155)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '0.75rem 1rem',
              background: 'var(--primary-color, #3b82f6)',
              color: 'white',
              fontWeight: 'bold',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.9rem',
            }}
          >
            <span>🤖 Asistente FungiTrack</span>
            <button
              onClick={() => { setIsOpen(false); setDetectedFields(null); }}
              style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.3rem', cursor: 'pointer', padding: 0, lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          <div
            ref={chatRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontSize: '0.85rem',
            }}
          >
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary, #94a3b8)', padding: '2rem 1rem', fontSize: '0.85rem' }}>
                <p style={{ marginBottom: '0.5rem' }}>🎤 Decí o escribí observaciones de laboratorio.</p>
                <p style={{ fontSize: '0.75rem' }}>
                  Ej: "Registrá una derivación húmeda con MEA en sala incubación 2"
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  background: msg.role === 'user'
                    ? 'var(--primary-color, #3b82f6)'
                    : 'rgba(255,255,255,0.08)',
                  color: msg.role === 'user' ? 'white' : 'var(--text-primary, #f1f5f9)',
                  padding: '0.5rem 0.75rem',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  maxWidth: '85%',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {msg.text}
              </div>
            ))}
            {isProcessing && (
              <div style={{ alignSelf: 'flex-start', color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '0.5rem' }}>
                ⏳ Procesando...
              </div>
            )}
          </div>

          {detectedFields && (
            <div
              style={{
                margin: '0 0.75rem 0.75rem',
                padding: '0.75rem',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '12px',
                fontSize: '0.8rem',
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#10b981' }}>
                📋 Campos detectados
              </div>
              <pre style={{ fontSize: '0.7rem', margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
                {JSON.stringify(detectedFields, null, 2)}
              </pre>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', minHeight: 0 }} onClick={confirmarCampos}>
                  ✅ Copiar campos
                </button>
                <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', minHeight: 0 }} onClick={descartarCampos}>
                  Descartar
                </button>
              </div>
            </div>
          )}

          <div
            style={{
              padding: '0.75rem',
              borderTop: '1px solid var(--border-color, #334155)',
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              className="form-control"
              placeholder="Escribí o usá el micrófono..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isProcessing}
              style={{ flex: 1, fontSize: '0.85rem', minHeight: 0, height: '38px' }}
            />
            <button
              onClick={toggleListening}
              disabled={isProcessing}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                border: 'none',
                background: isListening ? '#ef4444' : 'var(--primary-color, #3b82f6)',
                color: 'white',
                fontSize: '1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background 0.2s',
              }}
              title={isListening ? 'Detener grabación' : 'Iniciar grabación'}
            >
              🎤
            </button>
            <button
              onClick={handleSend}
              disabled={isProcessing || !inputText.trim()}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                border: 'none',
                background: 'var(--primary-color, #3b82f6)',
                color: 'white',
                fontSize: '1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                opacity: (!inputText.trim() || isProcessing) ? 0.5 : 1,
              }}
              title="Enviar"
            >
              ➡️
            </button>
          </div>
        </div>
      )}
    </>
  );
}
