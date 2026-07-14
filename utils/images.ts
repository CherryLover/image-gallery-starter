import images from '../data/images.json'
import type { ImageProps } from './types'

export function getImages(): ImageProps[] {
  return images as ImageProps[]
}

export function getImageById(id: number): ImageProps | undefined {
  return getImages().find((img) => img.id === id)
}
