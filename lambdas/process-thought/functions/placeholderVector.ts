import { VECTOR_DIMENSIONS } from '../../../types/config';

export function getPlaceholderVector(): number[] {
  const vec = new Array(VECTOR_DIMENSIONS).fill(0);
  vec[0] = 1;
  return vec;
}
