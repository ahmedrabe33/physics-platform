# ⚛️ Physics Learning Platform

A cloud-native physics learning platform built using a **microservices architecture** and designed as a practical DevOps project for learning and demonstrating:

- Docker
- Docker Compose
- Kubernetes
- PostgreSQL
- NGINX Ingress
- Persistent Storage
- ConfigMaps & Secrets
- Health Probes
- Rolling Updates
- Resource Management
- Horizontal Scaling
- Microservices Communication

The application provides a complete learning workflow for Egyptian secondary school students, including registration, subscription approval, educational content, exercises, and lesson progress tracking.

---

## 📌 Project Overview

The platform allows students to:

- Create an account
- Select their educational grade
- Upload payment proof
- Wait for admin approval
- Access educational content after activation
- Browse chapters and lessons
- Solve exercises
- Track lesson progress
- Unlock lessons sequentially
- Renew expired subscriptions

Administrators can:

- Review student registrations
- Approve or reject students
- Renew subscriptions
- Add chapters
- Add lessons
- Add exercises
- Manage educational content

---

# 🏗️ Architecture

```text
                        Browser
                           │
                           │
                    physics.local
                           │
                           ▼
                 ┌───────────────────┐
                 │   NGINX Ingress   │
                 └─────────┬─────────┘
                           │
                           ▼
                 ┌───────────────────┐
                 │ Frontend Service  │
                 │      :3000        │
                 └─────────┬─────────┘
                           │
                           ▼
                 ┌───────────────────┐
                 │    API Gateway    │
                 │      :8080        │
                 └─────────┬─────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
 ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
 │  Auth Service  │ │Student Service │ │Content Service │
 │     :3001      │ │     :3002      │ │     :3003      │
 └───────┬────────┘ └───────┬────────┘ └───────┬────────┘
         │                  │                  │
         │                  │                  │
         └──────────────┬───┴───────────┐      │
                        │               │      │
                        ▼               ▼      ▼
                ┌───────────────────────────────┐
                │          PostgreSQL           │
                │             :5432             │
                └───────────────────────────────┘

                           ▲
                           │
                 ┌─────────┴──────────┐
                 │ Progress Service  │
                 │      :3004        │
                 └────────────────────┘
```

---

# 🧩 Microservices

| Service | Port | Responsibility |
|---|---:|---|
| Frontend | 3000 | Web UI and user sessions |
| API Gateway | 8080 | Routes API requests to backend services |
| Auth Service | 3001 | Authentication and user management |
| Student Service | 3002 | Student profiles, subscriptions and payments |
| Content Service | 3003 | Chapters, lessons and exercises |
| Progress Service | 3004 | Student lesson progress and unlocking |
| PostgreSQL | 5432 | Persistent relational database |

---

# 🛠️ Technology Stack

### Application

- Node.js
- Express.js
- EJS
- Axios
- Multer
- PostgreSQL

### Containers

- Docker
- Docker Compose
- Multi-stage Docker builds
- Alpine-based Node.js images
- Non-root containers

### Kubernetes

- Deployments
- StatefulSets
- Services
- NGINX Ingress
- ConfigMaps
- Secrets
- PersistentVolumeClaims
- StorageClasses
- Init Containers
- Startup Probes
- Readiness Probes
- Liveness Probes
- Resource Requests & Limits
- Rolling Updates
- Multiple Replicas

### Local Kubernetes Environment

- Minikube
- Multi-node Kubernetes cluster

---

# 📂 Project Structure

```text
physics-platform/
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   ├── public/
│   └── views/
│
├── gateway/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
│
├── services/
│   │
│   ├── auth-service/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── server.js
│   │
│   ├── student-service/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── server.js
│   │   └── uploads/
│   │
│   ├── content-service/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── server.js
│   │
│   └── progress-service/
│       ├── Dockerfile
│       ├── package.json
│       └── server.js
│
├── k8s/
│   │
│   ├── auth/
│   ├── student/
│   ├── content/
│   ├── progress/
│   ├── gateway/
│   ├── frontend/
│   ├── postgres/
│   ├── config/
│   └── ingress/
│
├── docker-compose.yml
├── .gitignore
├── health.sh
├── start-all.sh
├── stop-all.sh
└── README.md
```

---

# 🐳 Docker Architecture

Each microservice has its own Docker image.

The Dockerfiles follow security best practices including:

- Lightweight Alpine base images
- Production-only dependencies
- Multi-stage builds
- Non-root application user
- Limited container privileges
- Health checks
- `.dockerignore` usage

Example architecture:

```text
Source Code
    │
    ▼
Dockerfile
    │
    ▼
Docker Image
    │
    ▼
Container
```

---

# 🐳 Run with Docker Compose

Build and start the platform:

```bash
docker compose up -d --build
```

Check containers:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f
```

Stop the platform:

```bash
docker compose down
```

The frontend is available at:

```text
http://localhost:3000
```

---

# ☸️ Kubernetes Deployment

The Kubernetes version of the project runs on a multi-node Minikube cluster.

Example:

```bash
minikube start \
  --driver=docker \
  --nodes=3
```

Check nodes:

```bash
kubectl get nodes
```

---

# 📦 Kubernetes Namespace

The application uses a dedicated namespace:

```bash
kubectl create namespace physics
```

Check it:

```bash
kubectl get namespace physics
```

---

# ⚙️ Configuration Management

Application configuration is stored in a Kubernetes `ConfigMap`.

Example:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: physics-config
  namespace: physics

data:
  NODE_ENV: production

  DB_HOST: postgres
  DB_PORT: "5432"

  AUTH_SERVICE: http://auth-service:3001
  STUDENT_SERVICE: http://student-service:3002
  CONTENT_SERVICE: http://content-service:3003
  PROGRESS_SERVICE: http://progress-service:3004

  GATEWAY_URL: http://gateway:8080
```

---

# 🔐 Secrets Management

Sensitive values are stored in Kubernetes Secrets.

The real secret file is intentionally excluded from Git.

Example template:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: physics-secrets
  namespace: physics

type: Opaque

stringData:
  POSTGRES_USER: physics_user
  POSTGRES_PASSWORD: CHANGE_ME
  POSTGRES_DB: physics_db

  JWT_SECRET: CHANGE_ME
  SESSION_SECRET: CHANGE_ME
```

Create your local Secret before deployment.

> Never commit production credentials or secrets to Git.

---

# 🗄️ PostgreSQL

PostgreSQL runs as a Kubernetes `StatefulSet`.

```text
PostgreSQL StatefulSet
        │
        ▼
PersistentVolumeClaim
        │
        ▼
PersistentVolume
        │
        ▼
StorageClass
```

This ensures database data survives Pod recreation.

Check PostgreSQL:

```bash
kubectl get statefulset -n physics
```

Check storage:

```bash
kubectl get pvc -n physics
```

---

# 💾 Persistent Storage

Persistent storage is used for:

### PostgreSQL

Database files are stored in a PersistentVolume.

### Student Payment Uploads

Payment screenshots are stored separately using a PVC.

```text
Student Pod
    │
    ▼
/app/uploads
    │
    ▼
PersistentVolumeClaim
```

An Init Container configures the volume permissions before the application container starts.

---

# 🧠 Stateless vs Stateful Services

The backend architecture was redesigned so application data is stored in PostgreSQL instead of local JSON files.

Therefore:

```text
Auth Service      → Stateless
Content Service   → Stateless
Progress Service  → Stateless
Gateway           → Stateless
```

These services can safely run multiple replicas.

PostgreSQL remains stateful.

The Student Service currently uses persistent storage for uploaded payment screenshots.

---

# 🔄 Rolling Updates

Deployments use Kubernetes RollingUpdate strategy.

Example:

```yaml
strategy:
  type: RollingUpdate

  rollingUpdate:
    maxUnavailable: 0
    maxSurge: 1
```

This enables application updates without intentionally taking all replicas offline.

Update an image:

```bash
kubectl set image deployment/auth-service \
  auth-service=physics-auth:v2 \
  -n physics
```

Monitor:

```bash
kubectl rollout status deployment/auth-service -n physics
```

---

# ❤️ Health Checks

Services expose:

```text
/health
```

Three Kubernetes probes are used.

### Startup Probe

Determines whether the application successfully started.

### Readiness Probe

Determines whether the Pod can receive traffic.

### Liveness Probe

Detects unhealthy applications and allows Kubernetes to restart them.

Example:

```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 3003

  periodSeconds: 5
```

---

# 📊 Resource Management

Pods use CPU and memory requests and limits.

Example:

```yaml
resources:

  requests:
    cpu: "50m"
    memory: "64Mi"

  limits:
    cpu: "250m"
    memory: "256Mi"
```

This helps Kubernetes schedule Pods efficiently and prevents individual containers from consuming unlimited resources.

---

# 🔒 Container Security

Application containers run as non-root users.

Example:

```yaml
securityContext:

  runAsNonRoot: true
  runAsUser: 100
  runAsGroup: 101

  allowPrivilegeEscalation: false

  capabilities:
    drop:
      - ALL
```

This reduces the attack surface of the containers.

---

# 🌐 Kubernetes Networking

Backend services use `ClusterIP`.

```text
Frontend
    ↓
Gateway

Gateway
    ├── auth-service
    ├── student-service
    ├── content-service
    └── progress-service
```

Kubernetes internal DNS allows services to communicate using names such as:

```text
http://auth-service:3001
http://student-service:3002
http://content-service:3003
http://progress-service:3004
http://postgres:5432
```

No backend microservice needs direct external exposure.

---

# 🚪 NGINX Ingress

External traffic enters through NGINX Ingress.

Example hostname:

```text
physics.local
```

Architecture:

```text
Browser
   ↓
NGINX Ingress
   ↓
Frontend ClusterIP Service
   ↓
Frontend Pod
```

Example Ingress:

```yaml
apiVersion: networking.k8s.io/v1

kind: Ingress

metadata:
  name: physics-ingress
  namespace: physics

spec:

  ingressClassName: nginx

  rules:

    - host: physics.local

      http:

        paths:

          - path: /
            pathType: Prefix

            backend:

              service:

                name: frontend

                port:
                  number: 3000
```

---

# 🌍 Accessing the Application

Get the Minikube IP:

```bash
minikube ip
```

Add it to:

```text
/etc/hosts
```

Example:

```text
192.168.49.2 physics.local
```

Then open:

```text
http://physics.local
```

---

# 🧪 Useful Kubernetes Commands

Check all resources:

```bash
kubectl get all -n physics
```

Check Pods:

```bash
kubectl get pods -n physics
```

Check Services:

```bash
kubectl get svc -n physics
```

Check Ingress:

```bash
kubectl get ingress -n physics
```

Check PVCs:

```bash
kubectl get pvc -n physics
```

View logs:

```bash
kubectl logs <pod-name> -n physics
```

Follow logs:

```bash
kubectl logs -f <pod-name> -n physics
```

Describe a Pod:

```bash
kubectl describe pod <pod-name> -n physics
```

---

# 🐞 Troubleshooting Scenarios Practiced

This project was also used to practice real Kubernetes troubleshooting.

Issues encountered included:

### `ErrImageNeverPull`

Cause:

```text
Container image was not available on the node.
```

Resolution:

- Build/load the image on Minikube nodes
- Verify image tags
- Verify `imagePullPolicy`

---

### `CrashLoopBackOff`

Used:

```bash
kubectl logs
kubectl logs --previous
kubectl describe pod
```

to identify application startup failures.

---

### PVC Permission Errors

Example:

```text
EACCES: permission denied
```

The application container ran as a non-root user while the mounted volume had root ownership.

Solved using an Init Container to configure volume ownership.

---

### `CreateContainerConfigError`

Caused by missing ConfigMap or Secret keys.

Diagnosed using:

```bash
kubectl describe pod
```

and fixed by correcting ConfigMap and Secret configuration.

---

### Readiness / Startup Probe Failures

Example:

```text
connection refused
```

Used container logs and probe configuration to determine whether the application was actually listening on its expected port.

---

### Kubernetes API Server Timeout

Example:

```text
net/http: TLS handshake timeout
```

Diagnosed as local Minikube resource pressure and control-plane availability issues.

---

# 🔁 Application Flow

```text
Student Signup
      │
      ▼
Upload Payment Proof
      │
      ▼
Pending Approval
      │
      ▼
Admin Review
      │
      ├── Reject
      │
      └── Approve
             │
             ▼
       Subscription Active
             │
             ▼
          Grade
             │
             ▼
          Chapter
             │
             ▼
           Lesson
             │
             ▼
         Exercises
             │
             ▼
      Complete Lesson
             │
             ▼
      Unlock Next Lesson
```

---

# 📈 Scalability

Several stateless services run multiple replicas.

Example:

```text
Auth Service       ×2
Content Service    ×2
Progress Service   ×2
Gateway            ×2
```

Kubernetes Services distribute traffic between available Pods.

Future versions will introduce HPA for automatic scaling.

---

# 🚧 Current Development Notes

This project is currently used as both:

- A working educational platform prototype
- A hands-on DevOps/Kubernetes learning environment

Some development-oriented components are intentionally simple.

Current improvements planned include:

- Redis-backed sessions
- Horizontal Pod Autoscaling
- Monitoring with Prometheus and Grafana
- Centralized logs
- Helm packaging
- CI/CD pipeline
- Automated image builds
- Container security scanning
- GitOps deployment
- Cloud deployment
- HTTPS/TLS
- Object Storage for payment screenshots

---

# 🔮 DevOps Roadmap

```text
Application
    ✅

Docker
    ✅

Docker Compose
    ✅

PostgreSQL
    ✅

Kubernetes
    ✅

Persistent Storage
    ✅

ConfigMap / Secret
    ✅

Ingress
    ✅

Health Probes
    ✅

Rolling Updates
    ✅

        ↓

HPA
        ↓
Prometheus
        ↓
Grafana
        ↓
Helm
        ↓
GitHub Actions / Jenkins
        ↓
Trivy
        ↓
SonarQube
        ↓
GitOps / Argo CD
        ↓
Cloud Deployment
```

---

# 🎯 Project Goals

The main goal of this project is to demonstrate practical knowledge of:

- Containerization
- Microservices
- Kubernetes orchestration
- Service discovery
- Persistent storage
- Stateful vs stateless workloads
- Container security
- Application configuration
- Kubernetes troubleshooting
- High availability
- Scaling
- Deployment strategies

---

# 👨‍💻 Author

**Ahmed Rabie**

DevOps / Cloud Engineer

GitHub:

```text
https://github.com/ahmedrabe33
```

---

## ⭐ Support

If you find this project useful, consider giving the repository a star ⭐.
