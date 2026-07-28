const express =
  require("express");

const cors =
  require("cors");

const {
  createProxyMiddleware
} =
  require(
    "http-proxy-middleware"
  );

const app =
  express();

const PORT =
  process.env.PORT ||
  8080;

const AUTH_SERVICE =
  process.env
    .AUTH_SERVICE ||
  "http://localhost:3001";

const STUDENT_SERVICE =
  process.env
    .STUDENT_SERVICE ||
  "http://localhost:3002";

const CONTENT_SERVICE =
  process.env
    .CONTENT_SERVICE ||
  "http://localhost:3003";

const PROGRESS_SERVICE =
  process.env
    .PROGRESS_SERVICE ||
  "http://localhost:3004";

app.use(cors());

app.get(
  "/health",
  (req, res) => {
    res.json({
      service:
        "api-gateway",
      status:
        "healthy"
    });
  }
);

function proxy(
  prefix,
  target
) {
  app.use(
    prefix,

    createProxyMiddleware({
      target,
      changeOrigin:
        true,

      pathRewrite: {
        [`^${prefix}`]:
          ""
      }
    })
  );
}

proxy(
  "/api/auth",
  AUTH_SERVICE
);

proxy(
  "/api/students",
  STUDENT_SERVICE
);

proxy(
  "/api/content",
  CONTENT_SERVICE
);

proxy(
  "/api/progress",
  PROGRESS_SERVICE
);

app.use(
  (req, res) => {
    res
      .status(404)
      .json({
        message:
          "Gateway route not found"
      });
  }
);

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `api-gateway running on port ${PORT}`
    );
  }
);
