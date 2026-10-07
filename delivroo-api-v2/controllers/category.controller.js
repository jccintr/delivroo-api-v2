import { makeCrud } from '../utils/crud.js';
import { categoryDto } from '../utils/dto.js';

export const categories = makeCrud({
  table: 'categories',
  label: 'Categoria',
  columns: { name: 'name', position: 'position', active: 'active' },
  toDto: categoryDto,
  orderBy: ['position', 'name'],
});
