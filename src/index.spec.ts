import { redirects } from "./index";
import { Request, Response } from "servie/dist/node";

describe("popsicle redirects", () => {
  const req = new Request("http://example.com/");
  const ok = new Response(null, { status: 200 });

  const redirect = new Response(null, {
    status: 302,
    headers: {
      Location: "/test"
    }
  });

  it("should use cookie store for requests", async () => {
    let i = 0;
    const spy = jest.fn(async () => i++ === 0 ? redirect.clone() : ok.clone());
    const transport = redirects(spy);

    const res = await transport(req.clone(), async () => {
      throw new TypeError("Unexpected response");
    });

    expect(res.status).toEqual(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
