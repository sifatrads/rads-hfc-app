/**
 * Small dense linear solver for the GGA nodal system A·H = F.
 * The GGA matrix is symmetric positive-definite; Gaussian elimination with
 * partial pivoting is robust and adequate for the small/medium networks this
 * phase targets. A sparse Cholesky/CG path replaces it for large grids later.
 */

/** Solve A·x = b. `A` is n×n (row-major), `b` is length n. Returns x. */
export function solveLinear(Ain: readonly (readonly number[])[], bin: readonly number[]): number[] {
  const n = bin.length;
  const A: number[][] = Ain.map((row) => row.slice());
  const b: number[] = bin.slice();

  for (let col = 0; col < n; col++) {
    // partial pivot: largest magnitude in this column at/below the diagonal
    let pivot = col;
    let best = Math.abs(A[col]![col]!);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(A[r]![col]!);
      if (v > best) {
        best = v;
        pivot = r;
      }
    }
    if (best < 1e-14) throw new Error("Singular (or near-singular) matrix in linear solve.");
    if (pivot !== col) {
      const tmpRow = A[col]!;
      A[col] = A[pivot]!;
      A[pivot] = tmpRow;
      const tmpB = b[col]!;
      b[col] = b[pivot]!;
      b[pivot] = tmpB;
    }

    const pivotRow = A[col]!;
    const diag = pivotRow[col]!;
    for (let r = col + 1; r < n; r++) {
      const row = A[r]!;
      const factor = row[col]! / diag;
      if (factor === 0) continue;
      for (let c = col; c < n; c++) row[c] = row[c]! - factor * pivotRow[c]!;
      b[r] = b[r]! - factor * b[col]!;
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    const Ar = A[row]!;
    let sum = b[row]!;
    for (let c = row + 1; c < n; c++) sum -= Ar[c]! * x[c]!;
    x[row] = sum / Ar[row]!;
  }
  return x;
}
