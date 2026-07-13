import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "./route";

test("rejects impossible and unbounded raw-source ranges", async () => {
  const pastEnd = await GET(new NextRequest("http://localhost/api/source?path=README.md&start=999999"));
  assert.equal(pastEnd.status, 416);
  const tooMany = await GET(new NextRequest("http://localhost/api/source?path=README.md&end=5000"));
  assert.equal(tooMany.status, 400);
});
