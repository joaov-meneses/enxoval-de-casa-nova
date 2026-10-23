import { Brand } from './Brand';
import { Button } from './ui/button';
import './workspaceLoading.css';

/** A mesma estrutura durante o bootstrap e a primeira consulta de acesso. Sem dados antes da confirmação. */
export function WorkspaceLoading({ error, retrying = false, onRetry, onLogout }: {
  error?: string;
  retrying?: boolean;
  onRetry?: () => void;
  onLogout?: () => void;
}) {
  return (
    <main className="workspace-loading" aria-busy={!error || retrying} aria-label="Carregando seu enxoval">
      <aside className="workspace-loading-sidebar" aria-hidden="true">
        <Brand />
        <div className="workspace-loading-nav">{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div>
      </aside>
      <div className="workspace-loading-body">
        <header className="workspace-loading-header"><Brand /><span className="workspace-loading-bar" aria-hidden="true" /></header>
        <div className="workspace-loading-content">
          {error ? (
            <div className="workspace-loading-error" role="alert">
              <h1>Não conseguimos abrir seu enxoval agora.</h1>
              <p>{error}</p>
              <div>
                {onRetry && <Button variant="brand" size="brand" className="button button-dark" disabled={retrying} onClick={onRetry}>{retrying ? 'Tentando…' : 'Tentar novamente'}</Button>}
                {onLogout && <Button variant="brand" size="brand" className="button button-outline" onClick={onLogout}>Sair da conta</Button>}
              </div>
            </div>
          ) : <p className="workspace-loading-label" role="status">Carregando seu enxoval…</p>}
          <div className="workspace-loading-summary" aria-hidden="true">
            {[0, 1].map(index => <div key={index}><span className="workspace-loading-bar" /><span className="workspace-loading-bar" /></div>)}
          </div>
          <div className="workspace-loading-items" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => <div key={index}><span className="workspace-loading-check" /><span className="workspace-loading-bar" /></div>)}
          </div>
        </div>
      </div>
    </main>
  );
}
