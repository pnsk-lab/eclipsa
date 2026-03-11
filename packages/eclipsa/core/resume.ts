import {
  applyResumeHmrUpdateToRegisteredContainers,
  createResumeContainer,
  installResumeListeners,
  registerResumeContainer,
  type ResumePayload,
} from "./runtime.ts";
import {
  RESUME_HMR_EVENT,
  type ResumeHmrUpdatePayload,
} from "./resume-hmr.ts";

const STATE_ELEMENT_ID = "eclipsa-resume";

interface ViteHotContext {
  on(event: string, listener: (data: ResumeHmrUpdatePayload) => void | Promise<void>): void;
}

const getResumePayload = (doc: Document): ResumePayload | null => {
  const elem = doc.getElementById(STATE_ELEMENT_ID);
  if (!elem?.textContent) {
    return null;
  }

  return JSON.parse(elem.textContent) as ResumePayload;
};

const initResumeHmr = (hot: ViteHotContext | undefined) => {
  if (!hot) {
    return;
  }

  hot.on(RESUME_HMR_EVENT, async (payload) => {
    const result = await applyResumeHmrUpdateToRegisteredContainers(payload);
    if (result === "reload") {
      location.reload();
    }
  });
};

initResumeHmr((import.meta as ImportMeta & { hot?: ViteHotContext }).hot);

export const resumeContainer = (source: Document | HTMLElement = document) => {
  const doc = source instanceof Document ? source : source.ownerDocument;
  const root = source instanceof Document ? doc.body : source;
  const payload = getResumePayload(doc);

  if (!payload) {
    return;
  }

  const container = createResumeContainer(root, payload);
  registerResumeContainer(container);
  root.setAttribute("data-e-resume", "resumed");
  installResumeListeners(container);
};
