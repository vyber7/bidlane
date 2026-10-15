import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";
import { getApiErrorMessage } from "./api-error";

function responseError(data: unknown) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, undefined, {
    data, status: 400, statusText: "Bad Request", headers: {}, config,
  });
}

describe("API error messages", () => {
  it("reads the server's public validation message", () => {
    expect(getApiErrorMessage(responseError({ error: "Bid must be at least 12500" }), "Unable to bid")).toBe("Bid must be at least 12500");
  });

  it.each([null, [], "<html>Bad gateway</html>", { error: 123 }, { error: "   " }, { message: "Unexpected shape" }])(
    "uses a friendly fallback for a malformed response %j", (data) => {
      expect(getApiErrorMessage(responseError(data), "Please try again")).toBe("Please try again");
    }
  );

  it("does not expose internal or network error details", () => {
    expect(getApiErrorMessage(new Error("private details"), "Please try again")).toBe("Please try again");
    expect(getApiErrorMessage(new AxiosError("Connection refused", "ERR_NETWORK"), "Please try again")).toBe("Please try again");
  });
});
