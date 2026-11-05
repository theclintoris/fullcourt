import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import './styles.css';
import './styles/league-shell.css';
import './styles/league-data.css';
import './styles/league-records-era.css';
import './styles/league-responsive.css';
import './styles/mobile.css';
import App from './App.jsx';

async function bootstrap() {
  if (!window.fullcourt) {
    try {
      const { installMobileBridge } = await import('./mobile/install.js');
      await installMobileBridge();
    } catch (error) {
      console.error('[FullCourt] Mobile bridge failed to start.', error);
    }
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
