const P = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => "" : P),
  apply: () => P, construct: () => P, set: () => true,
});
export const exec = P;
export const appHome = P;
export const home = P;
export const spaces = P;
export const focused = P;
export const terminals = P;
export const settings = P;
export const shared = P;
export const setShared = P;
export const readTextFile = P;
export const reported = P;
export const panes = P;
export const run = P;
export const hc = P;
export const knownAgents = P;
export const pickFolder = P;
export const props = P;
export const closeOverlay = P;
export const openOverlay = P;
export const layout = P;
export const agents = P;
export const notify = P;
export const theme = P;
export const nextCommand = P;
export const themes = P;
export default P;