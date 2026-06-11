import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../popup/App';
import '../popup/styles.css';
import './panel.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
