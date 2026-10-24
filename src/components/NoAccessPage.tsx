import { Button } from "@/src/components/ui/button";
import { useEffect } from "react";
import { LockKeyhole } from "@/src/components/icons";
import type { AuthUser } from "../types";
import { Brand } from "./Brand";

/** Convidado que foi removido de todos os enxovais: a conta existe, mas não há nada a que ela tenha acesso. */
export function NoAccessPage({
  user,
  onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
}) {
  useEffect(() => {
    document.title = "Sem acesso | Casa Mia";
  }, []);

  return (
    <main className="account-access-page">
      <div className="account-access-brand">
        <a href="/" className="brand-link">
          <Brand />
        </a>
      </div>
      <section className="account-access-card" aria-labelledby="no-access-title">
        <span className="account-access-icon">
          <LockKeyhole size={26} aria-hidden="true" />
        </span>
        <h1 id="no-access-title">Você não participa de nenhum enxoval.</h1>
        <p>
          Você saiu ou foi removido do enxoval. Para voltar, peça um novo
          convite para {user.email}: ele chega por e-mail.
        </p>
        <Button variant="brand" size="brand"
          type="button"
          className="button button-dark account-cta"
          onClick={onLogout}
        >
          Sair da conta
        </Button>
      </section>
      <p className="account-access-footer">Seu lar, tomando forma.</p>
    </main>
  );
}
