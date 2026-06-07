import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CoreAdminContext } from 'ra-core';
import App from './App';
import { dataProvider, authProvider } from './providers/setup';
import './i18n';
import './styles/index.scss';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <CoreAdminContext dataProvider={dataProvider} authProvider={authProvider}>
        <App />
      </CoreAdminContext>
    </BrowserRouter>
  </React.StrictMode>
);
