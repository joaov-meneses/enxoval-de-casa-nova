import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AdminPage } from './components/AdminPage';
import { ForgotPasswordPage } from './components/ForgotPasswordPage';
import OnboardingFlow from './components/onboarding/OnboardingFlow';
import { PrivacyPage } from './components/PrivacyPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';
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
    ) : window.location.pathname === '/esqueci-senha' ? (
      <ForgotPasswordPage />
    ) : window.location.pathname === '/redefinir-senha' ? (
      <ResetPasswordPage />
    ) : (
      <App />
    )}
  </StrictMode>,
);
