'use client';

import { useState, useRef, useEffect } from 'react';

type Message = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
};

// Helper to format currency with color
function formatValue(value: string, type: 'currency' | 'percent' | 'neutral' = 'neutral') {
  const isPositive = !value.startsWith('-');
  const color = type === 'neutral' ? '#e0e0e0' : isPositive ? '#4ade80' : '#f05b6f';
  return <span style={{ color, fontWeight: 600 }}>{value}</span>;
}

// Parse message content for special formatting
function parseMessageContent(content: string) {
  // Match patterns like +$10.80, -5.2%, $1,234.56
  const parts = content.split(/(\+?\$[\d,]+\.?\d*|-?\$[\d,]+\.?\d*|[+-]?\d+\.?\d*%)/g);
  return parts.map((part, i) => {
    if (/^\+?\$[\d,]+\.?\d*$/.test(part)) {
      return <span key={i} style={{ color: '#4ade80', fontWeight: 600 }}>{part}</span>;
    }
    if (/^-\$[\d,]+\.?\d*$/.test(part)) {
      return <span key={i} style={{ color: '#f05b6f', fontWeight: 600 }}>{part}</span>;
    }
    if (/^[+]?\d+\.?\d*%$/.test(part)) {
      return <span key={i} style={{ color: '#4ade80', fontWeight: 600 }}>{part}</span>;
    }
    if (/^-\d+\.?\d*%$/.test(part)) {
      return <span key={i} style={{ color: '#f05b6f', fontWeight: 600 }}>{part}</span>;
    }
    return part;
  });
}

export default function AskPennyPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: 'assistant',
      content: "Hey! 🐱 I'm Penny, your trading assistant. Ask me anything about your portfolio — positions, performance, strategy, market conditions... I've got all the data right here."
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now(),
      role: 'user',
      content: input.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      
      const response = await fetch('/api/trading/ask-penny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          history
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.reply || "Sorry, I couldn't process that. Try again?"
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Ask Penny error:', error);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: "Oops! Something went wrong. Give me a sec and try again 🐱"
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 200px)',
      maxWidth: '900px',
      margin: '0 auto',
      padding: '0 24px 24px'
    }}>
      {/* Chat Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
              flexDirection: message.role === 'user' ? 'row-reverse' : 'row'
            }}
          >
            {/* Avatar */}
            {message.role === 'assistant' ? (
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #7b7dff 0%, #5b5ddf 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                flexShrink: 0
              }}>
                🐱
              </div>
            ) : (
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: '#2a2a4e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                color: '#888',
                flexShrink: 0
              }}>
                👤
              </div>
            )}

            {/* Message Bubble */}
            <div style={{
              maxWidth: '70%',
              padding: '14px 18px',
              borderRadius: message.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: message.role === 'user' ? '#7b7dff' : '#1e1e3f',
              color: message.role === 'user' ? '#fff' : '#e0e0e0',
              fontSize: '14px',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap'
            }}>
              {message.role === 'assistant' ? parseMessageContent(message.content) : message.content}
            </div>
          </div>
        ))}

        {/* Typing Indicator */}
        {isLoading && (
          <div style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #7b7dff 0%, #5b5ddf 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              flexShrink: 0
            }}>
              🐱
            </div>
            <div style={{
              padding: '14px 18px',
              borderRadius: '18px 18px 18px 4px',
              background: '#1e1e3f',
              display: 'flex',
              gap: '4px',
              alignItems: 'center'
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#7b7dff', animation: 'bounce 1.4s ease-in-out infinite' }} />
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#7b7dff', animation: 'bounce 1.4s ease-in-out 0.2s infinite' }} />
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#7b7dff', animation: 'bounce 1.4s ease-in-out 0.4s infinite' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div style={{
        display: 'flex',
        gap: '12px',
        padding: '16px',
        background: '#141428',
        borderRadius: '16px',
        border: '1px solid #2a2a4e'
      }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything about your portfolio..."
          disabled={isLoading}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#e0e0e0',
            fontSize: '14px',
            padding: '8px 0'
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          style={{
            padding: '10px 20px',
            borderRadius: '12px',
            border: 'none',
            background: input.trim() && !isLoading ? '#7b7dff' : '#2a2a4e',
            color: input.trim() && !isLoading ? '#fff' : '#666',
            fontSize: '14px',
            fontWeight: 600,
            cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease'
          }}
        >
          Send
        </button>
      </div>

      {/* Quick Actions */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginTop: '12px',
        flexWrap: 'wrap'
      }}>
        {[
          "How's my portfolio doing?",
          "What's my best performer?",
          "Should I change my strategy?",
          "Explain my win rate"
        ].map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => {
              setInput(suggestion);
              inputRef.current?.focus();
            }}
            disabled={isLoading}
            style={{
              padding: '8px 14px',
              borderRadius: '20px',
              border: '1px solid #2a2a4e',
              background: 'transparent',
              color: '#888',
              fontSize: '12px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <style jsx global>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
