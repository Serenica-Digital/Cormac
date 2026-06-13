import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { officeReady } from './office';

// Wait for office.js so Office.context (platform, partitionKey, host) is
// populated before the app reads it. Resolves even outside Excel so the pane
// still renders in a plain browser for quick dev.
void officeReady().finally(() => {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
