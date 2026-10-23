import { Check, CircleIcon } from "@/src/components/icons";
import { PASSWORD_RULES, unmetPasswordRules } from "../../shared/passwordPolicy";
import "./passwordRules.css";

/** Requisitos da senha nova, marcados conforme a pessoa digita. */
export function PasswordRules({ password, id }: { password: string; id?: string }) {
  const unmet = new Set(unmetPasswordRules(password));
  return (
    <ul className="password-rules" id={id} aria-label="Requisitos da senha">
      {PASSWORD_RULES.map((rule) => {
        const met = password !== "" && !unmet.has(rule.id);
        return (
          <li key={rule.id} className={met ? "is-met" : undefined}>
            {met ? (
              <Check size={14} strokeWidth={3} aria-hidden="true" />
            ) : (
              <CircleIcon size={14} aria-hidden="true" />
            )}
            <span>{rule.label}</span>
            <span className="sr-only">{met ? ": atendido" : ": pendente"}</span>
          </li>
        );
      })}
    </ul>
  );
}
