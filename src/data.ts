import type { EnxovalItem, Category } from './types';

export const CATEGORIES: Category[] = [
  'Cozinha',
  'Eletrodomésticos',
  'Quarto',
  'Banheiro',
  'Sala de Estar',
  'Área de Serviço',
  'Extra'
];

export const DEFAULT_ITEM_TEMPLATES: Array<{ name: string; category: Category }> = [
  { name: 'Jogo de Panelas', category: 'Cozinha' },
  { name: 'Jogo de Pratos', category: 'Cozinha' },
  { name: 'Faqueiro Tramontina', category: 'Cozinha' },
  { name: 'Jogo de Copos', category: 'Cozinha' },
  { name: 'Xícaras', category: 'Cozinha' },
  { name: 'Potes de Vidro', category: 'Cozinha' },
  { name: 'Tábua de Carne', category: 'Cozinha' },
  { name: 'Escorredor de Louça', category: 'Cozinha' },
  { name: 'Lixeira de Cozinha', category: 'Cozinha' },
  { name: 'Geladeira', category: 'Eletrodomésticos' },
  { name: 'Fogão / Cooktop', category: 'Eletrodomésticos' },
  { name: 'Microondas', category: 'Eletrodomésticos' },
  { name: 'Air Fryer', category: 'Eletrodomésticos' },
  { name: 'Liquidificador', category: 'Eletrodomésticos' },
  { name: 'Purificador de Água', category: 'Eletrodomésticos' },
  { name: 'Cama', category: 'Quarto' },
  { name: 'Colchão', category: 'Quarto' },
  { name: 'Travesseiros', category: 'Quarto' },
  { name: 'Jogo de Lençol', category: 'Quarto' },
  { name: 'Cobertor / Edredom', category: 'Quarto' },
  { name: 'Guarda-roupa', category: 'Quarto' },
  { name: 'Cabides', category: 'Quarto' },
  { name: 'Toalha de Banho', category: 'Banheiro' },
  { name: 'Toalha de Rosto', category: 'Banheiro' },
  { name: 'Tapetes', category: 'Banheiro' },
  { name: 'Lixeira', category: 'Banheiro' },
  { name: 'Escova de Sanitário', category: 'Banheiro' },
  { name: 'Armário de Pia', category: 'Banheiro' },
  { name: 'Sofá', category: 'Sala de Estar' },
  { name: 'Painel de TV', category: 'Sala de Estar' },
  { name: 'Televisão', category: 'Sala de Estar' },
  { name: 'Mesa de Centro', category: 'Sala de Estar' },
  { name: 'Tapete', category: 'Sala de Estar' },
  { name: 'Máquina de Lavar', category: 'Área de Serviço' },
  { name: 'Varal', category: 'Área de Serviço' },
  { name: 'Prendedor de Roupa', category: 'Área de Serviço' },
  { name: 'Ferro de Passar', category: 'Área de Serviço' },
  { name: 'Tábua de Passar', category: 'Área de Serviço' },
  { name: 'Vassoura e Rodo', category: 'Área de Serviço' },
  { name: 'Balde', category: 'Área de Serviço' }
];

const generateId = () => Math.random().toString(36).slice(2, 11);
const fallbackCategoryId = (category: Category) => category.toLowerCase().replace(/\s+/g, '-');

export const defaultItems: EnxovalItem[] = DEFAULT_ITEM_TEMPLATES.map((item, index) => ({
  id: generateId(),
  name: item.name,
  categoryId: fallbackCategoryId(item.category),
  category: item.category,
  checked: false,
  link: '',
  description: '',
  sortOrder: index
}));