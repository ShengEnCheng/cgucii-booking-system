import NextDocument, { Html, Head, Main, NextScript } from 'next/document'
import type { DocumentContext, DocumentProps } from 'next/document'

/**
 * 從 middleware 設定的 CSP 標頭取出 nonce，讓 Next 的 inline script 與 chunk script
 * 都帶上同一個 nonce，才能套用 nonce 式 CSP（Pages Router 需手動串接）。
 */
export default function Document(props: DocumentProps & { nonce?: string }) {
  const nonce = props.nonce
  return (
    <Html lang="zh-Hant">
      <Head />
      <body>
        <Main />
        <NextScript nonce={nonce} />
      </body>
    </Html>
  )
}

Document.getInitialProps = async (ctx: DocumentContext) => {
  const initialProps = await NextDocument.getInitialProps(ctx)

  let nonce: string | undefined
  try {
    const header = ctx.res?.getHeader?.('Content-Security-Policy')
    const csp = Array.isArray(header) ? header.join(';') : header
    if (typeof csp === 'string') {
      nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
    }
  } catch {
    nonce = undefined
  }

  return { ...initialProps, nonce }
}
