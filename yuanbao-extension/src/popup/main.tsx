import React from 'react';
import { createRoot } from 'react-dom/client';
import '@/ui/styles.css';
import { ChatPanel } from '@/ui/ChatPanel';

const root = document.getElementById('root')!;
createRoot(root).render(
  <React.StrictMode>
    <div style={{ width: 380, height: 540 }}>
      <ChatPanel />
    </div>
  </React.StrictMode>
);
