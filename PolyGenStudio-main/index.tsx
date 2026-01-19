import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

import { LoaderProvider } from './contexts/LoaderContext';
import { LoadingOverlay } from './components/LoadingOverlay';

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LoaderProvider>
      <LoadingOverlay />
      <App />
    </LoaderProvider>
  </React.StrictMode>
);