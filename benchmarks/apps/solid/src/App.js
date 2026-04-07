import { escape, ssr } from 'solid-js/web';
import { createData } from '../../../data';

export const App = () =>
  ssr(
    ['<div>', '</div>'],
    createData().map((item) =>
      ssr(
        ['<div><h3>', '</h3><p>', '</p></div>'],
        escape(item.name),
        escape(item.value),
      ),
    ),
  );
