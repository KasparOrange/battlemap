/**
 * The Tokens tab's device-local state (never synced): the token waiting for a tap on the map.
 */

/** The tablet-local Tokens tab state. */
class TokensLocal {
  /** Id of a token that is "armed": the next tap on an empty square places it (TK-05). */
  armed = $state<string | null>(null);
}

/** The one instance. */
export const tokensLocal = new TokensLocal();
