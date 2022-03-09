import { URL } from "url";
import { CommonRequest, CommonResponse } from "servie/dist/common";

/**
 * Add redirect support to servie events.
 */
declare module "servie/dist/signal" {
  export interface SignalEvents {
    redirect: [URL];
  }
}

/**
 * Redirection types to handle.
 */
enum REDIRECT_TYPE {
  FOLLOW_WITH_GET,
  FOLLOW_WITH_CONFIRMATION,
}

/**
 * Possible redirection status codes.
 */
const REDIRECT_STATUS: { [status: number]: number | undefined } = {
  "301": REDIRECT_TYPE.FOLLOW_WITH_GET,
  "302": REDIRECT_TYPE.FOLLOW_WITH_GET,
  "303": REDIRECT_TYPE.FOLLOW_WITH_GET,
  "307": REDIRECT_TYPE.FOLLOW_WITH_CONFIRMATION,
  "308": REDIRECT_TYPE.FOLLOW_WITH_CONFIRMATION,
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
 * Create a new request object and tidy up any loose ends to avoid leaking info.
 */
function safeRedirect<T>(
  request: CommonRequest<T>,
  location: string,
  method: string
) {
  const originalUrl = new URL(request.url);
  const newUrl = new URL(location, originalUrl);

  request.signal.emit("redirect", newUrl);

  const newRequest = request.clone();
  newRequest.url = newUrl.toString();
  newRequest.method = method;

  // Delete cookie header when leaving the original URL.
  if (originalUrl.origin !== newUrl.origin) {
    newRequest.headers.delete("cookie");
    newRequest.headers.delete("authorization");
  }

  return newRequest;
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
export function redirects<T extends CommonRequest, U extends CommonResponse>(
  fn: (req: T, next: () => Promise<U>) => Promise<U>,
  maxRedirects = 5,
  confirmRedirect: ConfirmRedirect = () => false
): (req: T, next: () => Promise<U>) => Promise<U> {
  return async function (initReq, done) {
    let req = initReq.clone();
    let redirectCount = 0;

    while (redirectCount++ < maxRedirects) {
      const res = await fn(req as T, done);
      const redirect = REDIRECT_STATUS[res.status];
      const location = res.headers.get("Location");

      if (redirect === undefined || !location) return res;

      await res.destroy(); // Ignore the result of the response on redirect.

      if (redirect === REDIRECT_TYPE.FOLLOW_WITH_GET) {
        const method = initReq.method.toUpperCase() === "HEAD" ? "HEAD" : "GET";

        req = safeRedirect(initReq, location, method);
        req.$rawBody = null; // Override internal raw body.
        req.headers.set("Content-Length", "0");

        continue;
      }

      if (redirect === REDIRECT_TYPE.FOLLOW_WITH_CONFIRMATION) {
        const { method } = req;

        // Following HTTP spec by automatically redirecting with GET/HEAD.
        if (method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD") {
          req = safeRedirect(initReq, location, method);

          continue;
        }

        // Allow the user to confirm redirect according to HTTP spec.
        if (confirmRedirect(req, res)) {
          req = safeRedirect(initReq, location, method);

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
