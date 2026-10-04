import { create } from 'zustand'

/** App-wide dialogs that can be opened from anywhere. */
interface UIState {
  syncOpen: boolean
  /** code from a ?sync= link, prefilled in the connect form */
  syncCode: string
  reviewOpen: boolean
  openSync: (code?: string) => void
  closeSync: () => void
  setReviewOpen: (open: boolean) => void
}

export const useUI = create<UIState>()((set) => ({
  syncOpen: false,
  syncCode: '',
  reviewOpen: false,
  openSync: (code = '') => set({ syncOpen: true, syncCode: code }),
  closeSync: () => set({ syncOpen: false, syncCode: '' }),
  setReviewOpen: (reviewOpen) => set({ reviewOpen }),
}))
