export function shouldPersistOidcState(hostname: string, isDev: boolean) {
  return isDev || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}
