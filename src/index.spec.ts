import { jest, expect, describe } from "@jest/globals";
import { Request, Response } from "servie/dist/node";
import { redirects } from "./index";

describe("popsicle redirects", () => {
  it("should follow 302 redirect", async () => {
    const spy = jest.fn(async (req: Request) => {
      if (spy.mock.calls.length === 1) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/test",
          },
        });
      }

      expect(req.url).toEqual("http://example.com/test");
      return new Response(null, { status: 200 });
    });

    const transport = redirects(spy);

    const res = await transport(new Request("http://example.com"), async () => {
      throw new TypeError("Unexpected response");
    });

    expect(res.status).toEqual(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  describe("secure headers", () => {
    const headers = {
      cookie: "example_cookie",
      authorization: "example_authorization",
    };

    it("should maintain cookies when staying with original host", async () => {
      const spy = jest.fn(async (req: Request) => {
        if (spy.mock.calls.length === 1) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: "/test",
            },
          });
        }

        expect(req.url).toEqual("http://example.com/test");
        expect(req.headers.get("Cookie")).toBe(headers.cookie);
        expect(req.headers.get("Authorization")).toBe(headers.authorization);
        return new Response(null, { status: 200 });
      });

      const transport = redirects(spy);

      const res = await transport(
        new Request("http://example.com", { headers }),
        async () => {
          throw new TypeError("Unexpected response");
        }
      );

      expect(res.status).toEqual(200);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("should discard cookies when leaving original host", async () => {
      const spy = jest.fn(async (req: Request) => {
        if (spy.mock.calls.length === 1) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: "https://example.com",
            },
          });
        }

        expect(req.url).toEqual("https://example.com/");
        expect(req.headers.get("Cookie")).toBe(null);
        expect(req.headers.get("Authorization")).toBe(null);
        return new Response(null, { status: 200 });
      });

      const transport = redirects(spy);

      const res = await transport(
        new Request("http://example.com", { headers }),
        async () => {
          throw new TypeError("Unexpected response");
        }
      );

      expect(res.status).toEqual(200);
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
