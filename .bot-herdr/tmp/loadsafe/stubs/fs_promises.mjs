const P = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => "" : P),
  apply: () => P, construct: () => P, set: () => true,
});
export default P;