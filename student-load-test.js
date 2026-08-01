import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const errors = new Rate("errors");

export const options = {
  stages: [
    { duration: "1m", target: 5 },
    { duration: "2m", target: 10 },
    { duration: "2m", target: 15 },
    { duration: "2m", target: 20 },
    { duration: "1m", target: 0 },
  ],

  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000"],
    errors: ["rate<0.01"],
  },
};

const BASE_URL = "https://rabie-physics.duckdns.org";

export default function () {
  const loginResponse = http.post(
    `${BASE_URL}/login`,
    {
      username: "ahmed",
      password: "ahmed",
    },
    {
      redirects: 0,
      timeout: "10s",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const loginSuccess = check(loginResponse, {
    "login returns redirect": (r) =>
      r.status === 302 || r.status === 303,
    "login redirects to dashboard": (r) =>
      (r.headers.Location || "").includes("/dashboard"),
  });

  if (!loginSuccess) {
    console.log(
      `LOGIN FAILED status=${loginResponse.status} location=${loginResponse.headers.Location || ""}`
    );
    errors.add(true);
    sleep(2);
    return;
  }

  const dashboardResponse = http.get(
    `${BASE_URL}/dashboard`,
    {
      timeout: "10s",
    }
  );

  const dashboardSuccess = check(dashboardResponse, {
    "dashboard returns 200": (r) => r.status === 200,
    "dashboard loads below 2 seconds": (r) =>
      r.timings.duration < 2000,
    "dashboard contains student page": (r) =>
      r.body.includes("لوحة الطالب") ||
      r.body.includes("المسار الدراسي"),
  });

  errors.add(!dashboardSuccess);

  sleep(3);
}
