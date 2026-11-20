import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
const { app } = await import("./server.js");

const DEMO_ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clinic.local";
const DEMO_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

async function withServer(callback) {
  const server = app.listen(0);
  const port = server.address().port;
  try {
    await callback(port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function login(port) {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  return body.token;
}

test("health endpoint responds with ok status", async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "ok");
  });
});

test("login succeeds with the demo admin credentials and exposes the session via /api/auth/me", async () => {
  await withServer(async (port) => {
    const token = await login(port);
    assert.ok(token);

    const meResponse = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(meResponse.status, 200);
    const me = await meResponse.json();
    assert.equal(me.email, DEMO_ADMIN_EMAIL);
    assert.equal(me.role, "admin");
    assert.equal(me.passwordHash, undefined);
  });
});

test("login rejects incorrect credentials", async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: DEMO_ADMIN_EMAIL, password: "wrong-password" }),
    });
    assert.equal(response.status, 401);
  });
});

test("protected endpoints require a valid bearer token", async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/voice/twilio/status`);
    assert.equal(response.status, 401);

    const withBadToken = await fetch(`http://127.0.0.1:${port}/api/voice/twilio/status`, {
      headers: { Authorization: "Bearer not-a-real-token" },
    });
    assert.equal(withBadToken.status, 401);
  });
});

test("twilio status endpoint is present and responds with configuration info", async () => {
  await withServer(async (port) => {
    const token = await login(port);
    const response = await fetch(`http://127.0.0.1:${port}/api/voice/twilio/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(typeof body.configured, "boolean");
    assert.ok(
      body.phoneNumber === null || typeof body.phoneNumber === "string",
    );
    assert.ok(body.webhookUrl === null || typeof body.webhookUrl === "string");
  });
});

test("receptionist settings reject invalid business hours and clinic lists", async () => {
  await withServer(async (port) => {
    const token = await login(port);
    for (const body of [
      { hoursStart: "17:00", hoursEnd: "08:00" },
      { hoursStart: "8am", hoursEnd: "17:00" },
      { clinics: [] },
    ]) {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/receptionist/settings`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        },
      );
      assert.equal(response.status, 400);
    }
  });
});

test("intake submission requires consent and a call reason", async () => {
  await withServer(async (port) => {
    const token = await login(port);
    for (const body of [
      { reason: "Checkup", consent: false },
      { reason: "", consent: true },
    ]) {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/receptionist/intake`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        },
      );
      assert.equal(response.status, 400);
    }
  });
});

test("receptionist question configuration endpoint returns and accepts the configured prompts", async () => {
  await withServer(async (port) => {
    const token = await login(port);
    const authHeaders = { Authorization: `Bearer ${token}` };

    const initialResponse = await fetch(
      `http://127.0.0.1:${port}/api/receptionist/questions`,
      { headers: authHeaders },
    );
    assert.equal(initialResponse.status, 200);
    const defaultQuestions = await initialResponse.json();
    assert.ok(Array.isArray(defaultQuestions));
    assert.ok(defaultQuestions.length > 0);

    const nextQuestions = [
      { id: 1, prompt: "What is your name?", type: "text", required: true },
      {
        id: 2,
        prompt: "When would you like to visit?",
        type: "date",
        required: true,
      },
    ];

    const updateResponse = await fetch(
      `http://127.0.0.1:${port}/api/receptionist/questions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ questions: nextQuestions }),
      },
    );

    assert.equal(updateResponse.status, 200);
    const savedQuestions = await updateResponse.json();
    assert.deepEqual(savedQuestions, nextQuestions);
  });
});

test("user management endpoints require an admin session and a connected database", async () => {
  await withServer(async (port) => {
    const token = await login(port);
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // No database is connected in the test environment, so persistent user
    // management correctly reports 503 rather than 403 (the admin role check passes).
    assert.equal(response.status, 503);
  });
});

test("assistant and widget endpoints are database-aware and remain protected", async () => {
  await withServer(async (port) => {
    const token = await login(port);
    for (const path of ["/api/assistants", "/api/widgets"]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 503);
    }
  });
});

test("standalone loader is served without exposing server secrets", async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/widget/loader.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /javascript/);
    const source = await response.text();
    assert.match(source, /attachShadow/);
    assert.doesNotMatch(source, /OPENAI_API_KEY/);
  });
});
