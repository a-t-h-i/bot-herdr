export const LIMITS = {
    itemChars: 4000,
    requestChars: 110_000,
    choiceOptions: 250
};
export const CLIP_MARKER = " […]";
export function clip(text, max = LIMITS.itemChars) {
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - CLIP_MARKER.length)).trimEnd()}${CLIP_MARKER}`;
}
export function clipTail(text, max = LIMITS.itemChars) {
    if (text.length <= max) return text;
    return `[…] ${text.slice(text.length - Math.max(0, max - 4)).trimStart()}`;
}
export function requestSize(request) {
    return JSON.stringify(request).length;
}
export function fitsBudget(request) {
    return requestSize(request) <= LIMITS.requestChars;
}
