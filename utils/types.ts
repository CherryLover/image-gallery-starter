/* eslint-disable no-unused-vars */
export interface ImageProps {
  id: number
  height: number
  width: number
  src: string
  filename: string
  format: string
  color: string
  blurDataUrl?: string
}

export interface SharedModalProps {
  index: number
  images?: ImageProps[]
  currentPhoto?: ImageProps
  changePhotoId: (newVal: number) => void
  closeModal: () => void
  navigation: boolean
  direction?: number
}
