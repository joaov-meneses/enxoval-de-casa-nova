import { randomBytes } from "node:crypto";
import { passwordPolicyError } from "../shared/passwordPolicy.ts";

/** Senha aleatória que segue a regra de senha nova (letra, número, caractere especial, sem 123). */
export function strongPassword() {
  for (;;) {
    const candidate = `Casa#7${randomBytes(12).toString("base64url")}`;
    if (!passwordPolicyError(candidate)) return candidate;
  }
}
