const P = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => "" : P),
  apply: () => P, construct: () => P, set: () => true,
});
export const div = P;
export const svg = P;
export const image = P;
export const View = P;
export default P;