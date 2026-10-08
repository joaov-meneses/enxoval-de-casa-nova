import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AdminPage } from './components/AdminPage';
import OnboardingFlow from './components/onboarding/OnboardingFlow';
import { PrivacyPage } from './components/PrivacyPage';
import './index.css';

// /signup antigo: a conta só é criada no fim do funil de onboarding.
if (window.location.pathname === '/signup') window.history.replaceState({}, '', '/comecar');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/^\/admin(?:\/|$)/.test(window.location.pathname) ? (
      <AdminPage />
    ) : window.location.pathname === '/comecar' ? (
      <OnboardingFlow />
    ) : window.location.pathname === '/privacidade' ? (
      <PrivacyPage />
    ) : (
      <App />
    )}
  </StrictMode>,
);
