// Registers every calculation mode with the mode factory.
import { registerMode } from './index.js';
import { CalculateMode } from './calculate.js';
import { ComplexMode } from './complex.js';
import { BaseNMode } from './basen.js';
import { MatrixMode, VectorMode } from './matrixmode.js';
import { StatMode } from './statmode.js';
import { DistMode } from './distmode.js';
import { SheetMode } from './sheetmode.js';
import { TableMode } from './tablemode.js';
import { EqnMode, IneqMode, RatioMode } from './eqnmode.js';

registerMode('calc', CalculateMode);
registerMode('cmplx', ComplexMode);
registerMode('basen', BaseNMode);
registerMode('matrix', MatrixMode);
registerMode('vector', VectorMode);
registerMode('stat', StatMode);
registerMode('dist', DistMode);
registerMode('sheet', SheetMode);
registerMode('table', TableMode);
registerMode('eqn', EqnMode);
registerMode('ineq', IneqMode);
registerMode('ratio', RatioMode);
