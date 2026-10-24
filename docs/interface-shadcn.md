# Interface do Casa Mia

Os controles compartilhados usam shadcn/ui com os primitives do Radix. O código fica em
`src/components/ui/`; `components.json` configura o CLI e os aliases existentes do Vite.

- `src/shadcn.css` liga os tokens semânticos à paleta Casa Mia e define a ordem dos portais.
- `Button` tem os variants padrão do shadcn e o variant `brand` para os controles com estilos específicos do produto.
- `Dialog.tsx` e `Select.tsx` adaptam a API das telas aos componentes shadcn. Radix controla foco, Escape, interação fora e navegação pelo teclado. Os modais respeitam o estado de gravação e restauram o foco ao acionador, inclusive quando abertos por um menu.
- O menu móvel usa `Sheet`; a conta e a exportação no desktop usam `DropdownMenu`. No celular, a exportação usa um `Dialog` inferior, com seleção de formato e download por ambiente.
- As escolhas usam `RadioGroup` e `Checkbox`, inclusive nos cartões do onboarding. As abas usam `Tabs`; FAQ e seções expansíveis usam `Accordion` e `Collapsible`.
- Campos, tabelas, cartões, indicadores e avatares vêm da mesma pasta de componentes.

## Motion e ícones

Motion 14 mantém as animações das telas e alimenta o `@animate-ui/react` 2.
Os componentes `MotionButton` e `MotionLabel` em `ui/motion.tsx` permitem animar
os controles shadcn.

Todos os ícones são importados de `src/components/icons.tsx`. Essa fachada mantém
os tamanhos e nomes usados pelas telas e reúne 70 ícones oficiais do registro
Animate UI e 44 extensões para símbolos ausentes do catálogo, como móveis e
eletrodomésticos. As extensões preservam os desenhos e usam `IconWrapper`,
variantes e contexto de animação do Animate UI. A dependência `lucide-react` foi removida;
a atribuição dos desenhos está em `src/components/animate-ui/icons/LUCIDE-LICENSE`.

`Button` e `Label` acionam os ícones ao passar o mouse ou tocar em qualquer parte
do controle. Indicadores de carregamento usam animação contínua do Animate UI.
A preferência por movimento reduzido é respeitada pelo motor de animação.

O registro `@animate-ui` está configurado para adicionar novos ícones:

```powershell
npx shadcn@latest add @animate-ui/icons-lucide-bell
```

Após adicionar um ícone, exponha-o pela fachada para preservar tamanho,
acessibilidade e comportamento compartilhados. Referência:
[Lucide Icons do Animate UI](https://animate-ui.com/docs/icons/lucide-icons).

## Validação

`tests/shadcn-ui.spec.ts` cobre cadastro de itens, seletores em portais, Escape,
menus, exportação, abas, foco e acessibilidade em desktop e celular. Os testes de
onboarding, planos e administração continuam cobrindo os fluxos dessas telas.

`tests/animated-icons.spec.ts` verifica animação pelo botão inteiro, movimento
reduzido e os ícones de progresso do onboarding.

`tests/workspace-interactions.spec.ts` cobre o rabisco legível e a animação do item,
larguras iguais dos ambientes, expansão dos cards e entrada dos painéis, incluindo
movimento reduzido, foco e download da exportação no celular.
