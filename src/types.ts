export type Category = 
  | 'Cozinha' 
  | 'Eletrodomésticos' 
  | 'Quarto' 
  | 'Banheiro' 
  | 'Sala de Estar' 
  | 'Área de Serviço' 
  | 'Extra';

export interface EnxovalItem {
  id: string;
  name: string;
  category: Category;
  checked: boolean;
  link: string;
  description: string;
}
