import type { GetStaticProps, NextPage } from 'next'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Carousel from '../../components/Carousel'
import { getImageById, getImages } from '../../utils/images'
import type { ImageProps } from '../../utils/types'

const Home: NextPage = ({ currentPhoto }: { currentPhoto: ImageProps }) => {
  const router = useRouter()
  const { photoId } = router.query
  let index = Number(photoId)

  const currentPhotoUrl = currentPhoto.src

  return (
    <>
      <Head>
        <title>Jiang jiwei ShutterShowcase</title>
        <meta property="og:image" content={currentPhotoUrl} />
        <meta name="twitter:image" content={currentPhotoUrl} />
      </Head>
      <main className="mx-auto max-w-[1960px] p-4">
        <Carousel currentPhoto={currentPhoto} index={index} />
      </main>
    </>
  )
}

export default Home

export const getStaticProps: GetStaticProps = async (context) => {
  const currentPhoto = getImageById(Number(context.params.photoId))

  if (!currentPhoto) {
    return { notFound: true }
  }

  return {
    props: {
      currentPhoto,
    },
  }
}

export async function getStaticPaths() {
  const images = getImages()

  const fullPaths = images.map((img) => ({
    params: { photoId: img.id.toString() },
  }))

  return {
    paths: fullPaths,
    fallback: false,
  }
}
