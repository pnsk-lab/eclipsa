import {
  createResumeContainer,
  installResumeListeners,
  type ResumePayload,
} from "./runtime.ts";

const STATE_ELEMENT_ID = "eclipsa-resume";

const getResumePayload = (doc: Document): ResumePayload | null => {
  const elem = doc.getElementById(STATE_ELEMENT_ID);
  if (!elem?.textContent) {
    return null;
  }

  return JSON.parse(elem.textContent) as ResumePayload;
};

export const resumeContainer = (source: Document | HTMLElement = document) => {
  const doc = source instanceof Document ? source : source.ownerDocument;
  const root = source instanceof Document ? doc.body : source;
  const payload = getResumePayload(doc);

  if (!payload) {
    return;
  }

  const container = createResumeContainer(root, payload);
  root.setAttribute("data-e-resume", "resumed");
  installResumeListeners(container);
};
