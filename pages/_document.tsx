import Document, { Head, Html, Main, NextScript } from 'next/document'

class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          <link rel="icon" href="/favicon.ico" />
          <meta
            name="description"
            content="Discover the beauty of the world through the lens."
          />
          <meta property="og:site_name" content="shutters.flyooo.uk" />
          <meta
            property="og:description"
            content="Discover the beauty of the world through the lens."
          />
          <meta property="og:title" content="Jiang jiwei ShutterShowcase" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Discover the beauty of the world through the lens." />
          <meta
            name="twitter:description"
            content="Discover the beauty of the world through the lens."
          />
        </Head>
        <body className="bg-black antialiased">
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
