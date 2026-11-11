const P = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => "" : P),
  apply: () => P, construct: () => P, set: () => true,
});
export const v_flex = P;
export const h_flex = P;
export const TextView = P;
export const InputState = P;
export const Input = P;
export const TextareaState = P;
export const Textarea = P;
export const Editor = P;
export const EditorState = P;
export default P;