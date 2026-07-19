// Public surface of the third-party OAuth method. The HTTP router (authRouter)
// imports everything it needs from here, so the method's internals (flow,
// account, registry, pkce, providers) stay encapsulated behind one seam. A
// future auth method (password/magic-link) would expose its own sibling barrel.

export { enabledProviders, getProvider } from "./registry.js";
export {
  OAUTH_TX_COOKIE,
  OAUTH_TX_TTL_SECONDS,
  randomState,
  createVerifier,
  challengeFromVerifier,
} from "./pkce.js";
export {
  buildAuthorizeUrl,
  encodeTx,
  decodeTx,
  safeEqual,
  exchangeCode,
  fetchProfile,
  tokenColumns,
} from "./flow.js";
export { resolveUserId } from "./account.js";
