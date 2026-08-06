import React from 'react';
import { createRoot } from 'react-dom/client';
import '@/ui/styles.css';
import { OptionsApp } from './OptionsApp';

const root = document.getElementById('root')!;
createRoot(root).render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>
);
