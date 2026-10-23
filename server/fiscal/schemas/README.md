# Esquemas oficiais da DPS

Origem consultada em 22/10/2026: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip

Arquivos copiados sem alterações de `Schemas/1.01`. Somente dependências da DPS.

Compatibilidade do validador: em memória, `dps.ts` remove somente as âncoras `^`/`$`
da expressão oficial `TSSerieDPS`, pois libxml2 segue regex XSD 1.0 e interpreta
esses caracteres como literais. O campo também é validado estritamente no config.
Os arquivos oficiais e hashes abaixo permanecem intactos. A regra de negócio final
continua sendo validada pela SEFIN; a homologação oficial é necessária.

O perfil de assinatura está no manual integrado oficial; leiaute e regras de negócio vigentes no Anexo I e notas técnicas.

## SHA256

- `DPS_v1.01.xsd`: `fe45e5250a48e519aba89fc6a472863b8e602ed957778fb64692804933a00d0c`

- `tiposComplexos_v1.01.xsd`: `e8e09d525574cc224ca6d1f8d8eb0366043ab2a3aa8d0d234058e6244d60e371`

- `tiposSimples_v1.01.xsd`: `830ea116c34d7310699e34b214b7214a65f7e5d3b1f09aeaa702f7e3f4283b17`

- `xmldsig-core-schema.xsd`: `49848f732663aecb618d72ad6130c5c3240f0a10f3a1a8544b7d48a6c726046f`
