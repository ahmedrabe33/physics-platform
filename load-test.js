import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const errorRate = new Rate("errors");

export const options = {
  stages: [
    { duration: "1m", target: 5 },
    { duration: "2m", target: 10 },
    { duration: "2m", target: 20 },
    { duration: "2m", target: 30 },
    { duration: "2m", target: 40 },
    { duration: "1m", target: 0 },
  ],

  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
    errors: ["rate<0.01"],
  },
};

export default function () {
  const response = http.get(
    "https://rabie-physics.duckdns.org/",
    {
      timeout: "10s",
    }
  );

  const success = check(response, {
    "status is 200": (r) => r.status === 200,
    "response below 1.5 seconds": (r) =>
      r.timings.duration < 1500,
  });

  errorRate.add(!success);

  sleep(2);
}
