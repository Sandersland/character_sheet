// authRouter imports everything it needs from here, so the internals (flow, account, registry, pkce, providers) stay encapsulated behind one seam.
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
