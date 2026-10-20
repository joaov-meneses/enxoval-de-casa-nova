import { TooltipProvider } from "./components/ui/tooltip";
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AdminPage } from './components/AdminPage';
import { ForgotPasswordPage } from './components/ForgotPasswordPage';
import { InvitationPage } from './components/InvitationPage';
import OnboardingFlow from './components/onboarding/OnboardingFlow';
import { PrivacyPage } from './components/PrivacyPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import './index.css';
import { startSessionActivity } from './sessionActivity';
import { startAnalytics, captureError } from './analytics';

// /signup antigo: a conta só é criada no fim do funil de onboarding.
// Checkouts antigos voltavam para o onboarding; preserve a confirmação ao abrir o enxoval.
if (window.location.pathname === '/comecar' && new URLSearchParams(window.location.search).get('assinatura') === 'sucesso') {
  window.history.replaceState({}, '', `/app${window.location.search}`);
}
if (window.location.pathname === '/signup') window.history.replaceState({}, '', '/comecar');

// /login?cadastro=1 antigo: o cadastro agora tem rota própria.
if (
  window.location.pathname === '/login' &&
  new URLSearchParams(window.location.search).has('cadastro')
) {
  window.history.replaceState({}, '', '/cadastro');
}

const stopAnalytics = startAnalytics();
if (import.meta.hot) import.meta.hot.dispose(stopAnalytics);

const stopSessionActivity = startSessionActivity();
if (import.meta.hot) import.meta.hot.dispose(stopSessionActivity);

createRoot(document.getElementById('root')!, {
  onUncaughtError: (error, info) => captureError(error, { error_source: 'react.uncaught', ...info }),
  onCaughtError: (error, info) => captureError(error, { error_source: 'react.caught', ...info }),
}).render(
  <StrictMode>
    <TooltipProvider>
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
    ) : window.location.pathname === '/convite' ? (
      <InvitationPage />
    ) : (
      <App />
    )}
    </TooltipProvider>
  </StrictMode>,
);
