import { resolve } from "url";
import { CommonRequest, CommonResponse } from "servie/dist/common";

/**
 * Add redirect support to servie events.
 */
declare module "servie/dist/signal" {
  export interface SignalEvents {
    redirect: [string];
  }
}

/**
 * Redirection types to handle.
 */
enum REDIRECT_TYPE {
  FOLLOW_WITH_GET,
  FOLLOW_WITH_CONFIRMATION
}

/**
 * Possible redirection status codes.
 */
const REDIRECT_STATUS: { [status: number]: number | undefined } = {
  "301": REDIRECT_TYPE.FOLLOW_WITH_GET,
  "302": REDIRECT_TYPE.FOLLOW_WITH_GET,
  "303": REDIRECT_TYPE.FOLLOW_WITH_GET,
  "307": REDIRECT_TYPE.FOLLOW_WITH_CONFIRMATION,
  "308": REDIRECT_TYPE.FOLLOW_WITH_CONFIRMATION
};

/**
 * Maximum redirects error.
 */
export class MaxRedirectsError extends Error {
  code = "EMAXREDIRECTS";

  constructor(public request: CommonRequest, message: string) {
    super(message);
  }
}

/**
 * Redirect confirmation function.
 */
export type ConfirmRedirect = <
  T extends CommonRequest,
  U extends CommonResponse
>(
  request: T,
  response: U
) => boolean;

/**
 * Middleware function for following HTTP redirects.
 */
export function redirects<
  T extends CommonRequest,
  U extends CommonResponse
>(
  fn: (req: T, next: () => Promise<U>) => Promise<U>,
  maxRedirects = 5,
  confirmRedirect: ConfirmRedirect = () => false
): (req: T, next: () => Promise<U>) => Promise<U> {
  return async function(initialRequest, done) {
    let req = initialRequest.clone();
    let redirectCount = 0;

    while (redirectCount++ < maxRedirects) {
      const res = await fn(req as T, done);
      const redirect = REDIRECT_STATUS[res.status];

      if (redirect === undefined || !res.headers.has("Location")) return res;

      const newUrl = resolve(req.url, res.headers.get("Location")!); // tslint:disable-line

      // Ignore the result of the response on redirect.
      req.signal.emit("abort");
      req.signal.aborted = false; // Undo aborted state.
      req.signal.emit("redirect", newUrl);

      if (redirect === REDIRECT_TYPE.FOLLOW_WITH_GET) {
        req = req.clone();
        req.method =
          initialRequest.method.toUpperCase() === "HEAD" ? "HEAD" : "GET";
        req.$rawBody = null; // Override internal raw body.

        // No body will be sent with this redirect.
        req.headers.set("Content-Length", "0");

        continue;
      }

      if (redirect === REDIRECT_TYPE.FOLLOW_WITH_CONFIRMATION) {
        const method = req.method.toUpperCase();

        // Following HTTP spec by automatically redirecting with GET/HEAD.
        if (method === "GET" || method === "HEAD") {
          req = initialRequest.clone();
          req.url = newUrl;

          continue;
        }

        // Allow the user to confirm redirect according to HTTP spec.
        if (confirmRedirect(req, res)) {
          req = initialRequest.clone();
          req.url = newUrl;

          continue;
        }
      }

      return res;
    }

    throw new MaxRedirectsError(
      req,
      `Maximum redirects exceeded: ${maxRedirects}`
    );
  };
}
