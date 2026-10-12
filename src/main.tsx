import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/500.css';
import '@fontsource/noto-sans/600.css';
import '@fontsource/noto-sans/700.css';
import App from './App';
import { AppLanguageProvider } from './i18n';
import './styles.css';
import './templates.css';
import '@fontsource/noto-serif/400.css';
import '@fontsource/noto-serif/700.css';
import './studio.css';
import './theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AppLanguageProvider><App /></AppLanguageProvider></React.StrictMode>);
