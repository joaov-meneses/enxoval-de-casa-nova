import { TooltipProvider } from "./components/ui/tooltip";
import {lazy, StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import { LandingRoute } from './LandingRoute';
import './index.css';
import { startSessionActivity } from './sessionActivity';
import { startAnalytics, captureError } from './analytics';
import { capturePlanChoiceFromUrl } from './planChoice';

// Cada rota vira um pedaço próprio do pacote: a home não baixa o app, o admin nem o onboarding.
const App = lazy(() => import('./App.tsx'));
const AdminPage = lazy(() => import('./components/AdminPage').then((m) => ({ default: m.AdminPage })));
const ForgotPasswordPage = lazy(() => import('./components/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const InvitationPage = lazy(() => import('./components/InvitationPage').then((m) => ({ default: m.InvitationPage })));
const NinoMethodPage = lazy(() => import('./components/NinoMethodPage').then((m) => ({ default: m.NinoMethodPage })));
const OnboardingFlow = lazy(() => import('./components/onboarding/OnboardingFlow'));
const PrivacyPage = lazy(() => import('./components/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const ResetPasswordPage = lazy(() => import('./components/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));

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

capturePlanChoiceFromUrl();

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
    <Suspense fallback={null}>
    {window.location.pathname === '/' ? (
      <LandingRoute />
    ) : /^\/admin(?:\/|$)/.test(window.location.pathname) ? (
      <AdminPage />
    ) : window.location.pathname === '/comecar' ? (
      <OnboardingFlow />
    ) : window.location.pathname === '/como-o-nino-escolhe' ? (
      <NinoMethodPage />
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
    </Suspense>
    </TooltipProvider>
  </StrictMode>,
);
