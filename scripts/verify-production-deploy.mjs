const checks = [
  {
    name: "Rainmaker health",
    url: "https://rainmaker.edgpatioshade.com/health",
    status: 200,
    expectJsonStatusOk: true,
  },
  {
    name: "Unauthenticated user API",
    url: "https://rainmaker.edgpatioshade.com/api/user",
    status: 401,
  },
  {
    name: "Missing legacy quote image route",
    url: "https://rainmaker.edgpatioshade.com/quote-images/cutover-nonexistent.png",
    status: 404,
  },
];

async function checkEndpoint(check) {
  const response = await fetch(check.url, { redirect: "follow" });
  const body = await response.text();

  if (response.status !== check.status) {
    throw new Error(
      `${check.name} expected HTTP ${check.status}, got ${response.status}: ${body.slice(0, 200)}`
    );
  }

  if (check.expectJsonStatusOk) {
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      throw new Error(`${check.name} did not return JSON: ${body.slice(0, 200)}`);
    }

    if (payload.status !== "ok") {
      throw new Error(`${check.name} returned unexpected payload: ${body.slice(0, 200)}`);
    }
  }

  console.log(`ok ${check.name}: ${response.status}`);
}

for (const check of checks) {
  await checkEndpoint(check);
}

console.log("Production smoke verification passed.");
