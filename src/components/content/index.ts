/**
 * Компоненти, доступні в усіх MDX-файлах лаб і довідників БЕЗ import.
 * Сторінки передають цей об'єкт у <Content components={mdxComponents} />.
 *
 * Щоб додати новий компонент для текстів: створіть .astro-файл у цій теці й додайте його сюди.
 * (Симуляцію кожна лаба імпортує сама: import Simulation from './Simulation.tsx'.)
 */
import Definition from './Definition.astro';
import KeyIdea from './KeyIdea.astro';
import Note from './Note.astro';
import Warning from './Warning.astro';
import FinalTask from './FinalTask.astro';
import ControlQuestions from './ControlQuestions.astro';
import Question from './Question.astro';
import Formula from './Formula.astro';
import MaterialsTable from './MaterialsTable.astro';
import InstrumentsTable from './InstrumentsTable.astro';
import ConstantsTable from './ConstantsTable.astro';

export const mdxComponents = {
  Definition,
  KeyIdea,
  Note,
  Warning,
  FinalTask,
  ControlQuestions,
  Question,
  Formula,
  MaterialsTable,
  InstrumentsTable,
  ConstantsTable,
};
