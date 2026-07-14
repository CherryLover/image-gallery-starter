/* eslint-disable no-unused-vars */
export interface ImageProps {
  id: number
  /** Display size for grid (thumb) */
  height: number
  width: number
  widthLarge?: number
  heightLarge?: number
  widthFull?: number
  heightFull?: number
  /** Grid / list URL (thumb) */
  src: string
  /** Lightbox URL */
  srcLarge?: string
  /** Original / download URL */
  srcFull?: string
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
