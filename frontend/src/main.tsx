import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { installFrontendObservers } from './core/observability/frontendObservability';
import './styles/globals.css';

installFrontendObservers();

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing #root element for Aardvarkland UI');
}

createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
