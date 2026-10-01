// Calculator error conditions (manual: "Error Messages").
export const ERROR_TEXT = {
  Math: 'Math ERROR',
  Stack: 'Stack ERROR',
  Syntax: 'Syntax ERROR',
  Argument: 'Argument ERROR',
  Dimension: 'Dimension ERROR',
  Variable: 'Variable ERROR',
  CantSolve: "Can't Solve",
  Range: 'Range ERROR',
  TimeOut: 'Time Out',
  Circular: 'Circular ERROR',
  Memory: 'Memory ERROR',
};

export class CalcError extends Error {
  constructor(type, pos = null) {
    super(ERROR_TEXT[type] || type);
    this.type = type;
    this.pos = pos; // token reference for "Goto" (cursor positioning)
  }
}

// Wrap low-level exceptions (RangeError from decimal functions) into Math ERROR.
export function asCalcError(e) {
  if (e instanceof CalcError) return e;
  if (e instanceof RangeError) return new CalcError('Math');
  return e;
}
