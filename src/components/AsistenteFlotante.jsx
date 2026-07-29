import { useState, useEffect, useRef } from 'react';
import { askLLM, getBackendStatus } from '../agent/llmRouter';
import { buildContext } from '../agent/firestoreContext';
import toast from 'react-hot-toast';

export default function AsistenteFlotante() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'agente', text: '¡Hola! Soy tu asistente de FungiTrack. ¿En qué puedo ayudarte?' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [backendStatus, setBackendStatus] = useState('...');
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SpeechRecognition();
      rec.lang = 'es-AR';
      rec.continuous = false;
      rec.interimResults = false;

      rec.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInputText(transcript);
        handleSend(transcript);
      };

      rec.onend = () => setIsListening(false);
      rec.onerror = (e) => {
        console.error('Speech error:', e);
        setIsListening(false);
        toast.error('No te escuché bien. Intentá de nuevo.');
      };

      recognitionRef.current = rec;
    }

    getBackendStatus().then(status => setBackendStatus(status.active));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const speak = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-AR';
      utterance.rate = 1;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSend = async (text) => {
    if (!text.trim() || isProcessing) return;

    const userMessage = { role: 'user', text: text.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsProcessing(true);

    try {
      const context = await buildContext();
      const response = await askLLM(text.trim(), context);
      const agenteMessage = { role: 'agente', text: response };
      setMessages(prev => [...prev, agenteMessage]);
      speak(response);
    } catch (err) {
      console.error('Error:', err);
      const errorMsg = { role: 'agente', text: '❌ Error al procesar tu consulta. Intentá de nuevo.' };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      toast.error('Tu navegador no soporta reconocimiento de voz. Usá Chrome.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const clearChat = () => {
    setMessages([{ role: 'agente', text: 'Chat limpiado. ¿En qué puedo ayudarte?' }]);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'var(--primary-color)',
          color: 'white',
          border: 'none',
          fontSize: '1.5rem',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        title="Asistente FungiTrack"
      >
        🤖
      </button>

      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '6rem',
          right: '2rem',
          width: '380px',
          maxHeight: '500px',
          background: 'var(--surface-color)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '1rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>🤖 Asistente FungiTrack</h3>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                {backendStatus}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={clearChat}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem' }}
                title="Limpiar chat"
              >
                🗑️
              </button>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ×
              </button>
            </div>
          </div>

          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  background: msg.role === 'user' ? 'var(--primary-color)' : 'rgba(255,255,255,0.05)',
                  color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                  padding: '0.75rem',
                  borderRadius: '12px',
                  maxWidth: '85%',
                  fontSize: '0.9rem',
                  lineHeight: '1.4',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {msg.text}
              </div>
            ))}
            {isProcessing && (
              <div style={{ alignSelf: 'flex-start', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                🤔 Pensando...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{
            padding: '1rem',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            gap: '0.5rem'
          }}>
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend(inputText)}
              placeholder="Escribí o hablá..."
              disabled={isProcessing}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-color)',
                color: 'var(--text-primary)'
              }}
            />
            <button
              onClick={toggleListening}
              disabled={isProcessing}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: isListening ? '#ef4444' : 'var(--primary-color)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title={isListening ? 'Detener' : 'Hablar'}
            >
              🎤
            </button>
            <button
              onClick={() => handleSend(inputText)}
              disabled={isProcessing || !inputText.trim()}
              style={{
                padding: '0 1rem',
                borderRadius: '8px',
                background: 'var(--primary-color)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                opacity: isProcessing || !inputText.trim() ? 0.5 : 1
              }}
            >
              Enviar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
