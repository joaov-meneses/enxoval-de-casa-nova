import type { EnxovalItem } from '../types';
import { priceReferenceOpportunity } from '../planning/priceOpportunity';
export function PriceOpportunityNote({ item }: { item: EnxovalItem }) {
  const opportunity = priceReferenceOpportunity(item);
  if (!opportunity) return null;
  return <p className="purchase-price-opportunity">
    <strong>{opportunity.percent}% abaixo da referência</strong>
    <span>Comparação com a mediana de {opportunity.samples} {opportunity.source}, atualizada em {new Date(opportunity.updatedAt).toLocaleDateString('pt-BR')}. Confira frete e condições na loja. A comparação não altera sua semana de compra.</span>
  </p>;
}
