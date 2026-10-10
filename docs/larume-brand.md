# Identidade Larume

A marca segue a referência enviada: casa de cantos arredondados e chaminé à direita, camadas de tecido dobrado e ramo de três folhas. A casa representa o lar; os tecidos remetem ao enxoval e ao cuidado; o ramo acompanha a ideia de um novo começo.

O nome é **Larume**, sempre com essa grafia, sem ponto após a palavra. A assinatura usa Cormorant Garamond 500. O restante da interface mantém DM Sans e Playfair Display.

## Paleta e aplicações

- Madeira: `#866344`; assinatura: `#70533d`.
- Areia: `#d4b895`; tecidos em marfim e tons de areia.
- Fundo: `#faf8f4`; verde da interface: `#343b32`.
- Sobre fotografia ou fundo escuro, o símbolo usa a versão branca, com sombras suaves apenas entre as camadas. No login e cadastro desktop, símbolo e nome ficam lado a lado e o nome é branco.
- A assinatura horizontal atende aos cabeçalhos e à navegação. A vertical segue a composição da referência e está disponível como arquivo. A compacta contém apenas o símbolo.
- Favicon e ícones de tela inicial usam o símbolo, com margem própria. A versão maskable reserva a área central segura.

## Arquivos

- `public/brand/larume-symbol-source.png`: resultado original da adaptação, com transparência.
- `public/brand/larume-symbol.webp`: versão otimizada de 512 × 512 usada na interface.
- `public/brand/larume-symbol-white.webp`: versão branca de 512 × 512 para fotografia e fundos escuros; `larume-symbol-white-source.png` guarda o resultado original com transparência.
- `public/brand/larume-logo.png`: assinatura vertical transparente, exportada com a mesma tipografia da interface.
- `public/larume-32.png`, `public/larume-192.png`, `public/larume-512.png`, `public/larume-apple-touch.png`, `public/larume-maskable-512.png`: ícones e atalhos.
- `src/components/Brand.tsx`: componente central para todas as aplicações da logo.

## Geração da imagem

Foi usada a ferramenta integrada `image_gen`, com a imagem enviada como alvo de edição e `transparent_background: true`. Não foi usado o fluxo CLI. O nome foi aplicado como texto na interface, separado do símbolo, para garantir sua grafia e leitura.

Prompt original, preservado como registro da geração anterior à correção do nome para Larume. O símbolo gerado não contém letras; a assinatura foi atualizada na interface e no PNG exportado:

> Use case: precise-object-edit / logo-brand. Asset type: transparent website brand symbol for Larumi, to pair with a live serif wordmark in UI. Edit target: attached logo. Preserve specifically the SAME silhouette and drawing of the reference symbol: the rounded house outline with pitched roof and short chimney on the RIGHT, three soft folded linen layers at its base, the top linen fold curling diagonally from upper-left to lower-right with an infinity-like loop, and the delicate central sprig with exactly three leaves. Keep the proportions, overlaps, curves, subtle sculptural relief, and warm premium minimalism faithful to the supplied logo; do NOT redesign the symbol. Remove the entire Aveli text and the white paper background. Output ONLY the original symbol, tightly centered in a square canvas with about 8% clear margin, completely transparent outside and through the open upper house interior. Palette adapt to Larumi's existing app: warm wood brown #866344 / #796449 for the house frame and sprig, ivory #f7f2e9 and sand #d4b895 for folded textiles, restrained soft shadows within the symbol only. No solid square backdrop, no paper texture, no text, no letters, no watermark, no extra symbols. Production-ready clean smooth edges with real alpha transparency. The brand name Larumi is typeset separately by the app, so include NO wordmark in this symbol asset.

Depois da geração, o símbolo recebeu corte das margens transparentes e otimização em WebP. Os ícones foram redimensionados a partir desse mesmo símbolo, preservando o desenho.

## Variante branca

A ferramenta integrada `image_gen` recebeu `larume-symbol-source.png` como alvo de edição, com `transparent_background: true`. A versão final foi conferida sobre o fundo escuro e sobre a fotografia do login. Prompt final da variante:

> Use case: precise-object-edit / logo-brand. Edit target: the supplied Larumi house symbol. Produce a WHITE variant of this EXACT logo for placing over a photographic background. Keep the same house silhouette, pitched roof, right-side chimney, three folded textile layers with the sweeping diagonal upper fold, central sprig with exactly three leaves, identical shape and proportions. Change ONLY the palette: the entire house frame and botanical sprig must be solid bright white #ffffff, and all fabric surfaces white with restrained pearl/light gray inner shadows to reveal the layers and gentle volume. No brown, beige, tan, gold, colored accents, or dark outer shadow. The white frame must be opaque and clearly readable on a busy warm photo. Preserve true alpha transparency everywhere outside the symbol and through the open upper house interior. Clean antialiased edges; no white square background, no checkerboard baked in, no text, letters, watermark or extra ornament. Tightly centered symbol only, with a modest transparent margin. This is the same drawing recolored, not a redesign.

## Continuidade dos dados

A mudança da marca não altera sessões, contas, permissões nem o esquema PostgreSQL.
