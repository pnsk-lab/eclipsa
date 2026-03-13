export const RESUME_HMR_EVENT = 'eclipsa:resume-update'

export interface ResumeHmrUpdatePayload {
  fileUrl: string
  fullReload: boolean
  rerenderComponentSymbols: string[]
  rerenderOwnerSymbols: string[]
  symbolUrlReplacements: Record<string, string>
}
