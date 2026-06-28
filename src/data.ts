import { EnxovalItem, Category } from './types';

export const CATEGORIES: Category[] = [
  'Cozinha',
  'Eletrodomésticos',
  'Quarto',
  'Banheiro',
  'Sala de Estar',
  'Área de Serviço',
  'Extra'
];

const generateId = () => Math.random().toString(36).substr(2, 9);

const createItem = (name: string, category: Category): EnxovalItem => ({
  id: generateId(),
  name,
  category,
  checked: false,
  link: '',
  description: ''
});

export const defaultItems: EnxovalItem[] = [
  // Cozinha
  createItem('Jogo de Panelas', 'Cozinha'),
  createItem('Jogo de Pratos', 'Cozinha'),
  createItem('Faqueiro Tramontina', 'Cozinha'),
  createItem('Jogo de Copos', 'Cozinha'),
  createItem('Xícaras', 'Cozinha'),
  createItem('Potes de Vidro', 'Cozinha'),
  createItem('Tábua de Carne', 'Cozinha'),
  createItem('Escorredor de Louça', 'Cozinha'),
  createItem('Lixeira de Cozinha', 'Cozinha'),
  
  // Eletrodomésticos
  createItem('Geladeira', 'Eletrodomésticos'),
  createItem('Fogão / Cooktop', 'Eletrodomésticos'),
  createItem('Microondas', 'Eletrodomésticos'),
  createItem('Air Fryer', 'Eletrodomésticos'),
  createItem('Liquidificador', 'Eletrodomésticos'),
  createItem('Purificador de Água', 'Eletrodomésticos'),
  
  // Quarto
  createItem('Cama', 'Quarto'),
  createItem('Colchão', 'Quarto'),
  createItem('Travesseiros', 'Quarto'),
  createItem('Jogo de Lençol', 'Quarto'),
  createItem('Cobertor / Edredom', 'Quarto'),
  createItem('Guarda-roupa', 'Quarto'),
  createItem('Cabides', 'Quarto'),
  
  // Banheiro
  createItem('Toalha de Banho', 'Banheiro'),
  createItem('Toalha de Rosto', 'Banheiro'),
  createItem('Tapetes', 'Banheiro'),
  createItem('Lixeira', 'Banheiro'),
  createItem('Escova de Sanitário', 'Banheiro'),
  createItem('Armário de Pia', 'Banheiro'),
  
  // Sala de Estar
  createItem('Sofá', 'Sala de Estar'),
  createItem('Painel de TV', 'Sala de Estar'),
  createItem('Televisão', 'Sala de Estar'),
  createItem('Mesa de Centro', 'Sala de Estar'),
  createItem('Tapete', 'Sala de Estar'),
  
  // Área de Serviço
  createItem('Máquina de Lavar', 'Área de Serviço'),
  createItem('Varal', 'Área de Serviço'),
  createItem('Prendedor de Roupa', 'Área de Serviço'),
  createItem('Ferro de Passar', 'Área de Serviço'),
  createItem('Tábua de Passar', 'Área de Serviço'),
  createItem('Vassoura e Rodo', 'Área de Serviço'),
  createItem('Balde', 'Área de Serviço'),
];
