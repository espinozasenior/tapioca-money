import { describe, it, expect } from "vitest";
import { GET_USER_POSITIONS } from "@/lib/morpho/queries";

describe("GET_USER_POSITIONS query", () => {
  const body = GET_USER_POSITIONS.loc!.source.body;

  it("requests pnl field", () => {
    expect(body).toContain("pnl");
  });

  it("requests pnlUsd field", () => {
    expect(body).toContain("pnlUsd");
  });

  it("still requests shares, assets, assetsUsd", () => {
    expect(body).toContain("shares");
    expect(body).toContain("assets");
    expect(body).toContain("assetsUsd");
  });

  it("still requests vault address and name", () => {
    expect(body).toContain("address");
    expect(body).toContain("name");
  });
});
