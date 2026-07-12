FROM node:20-alpine AS frontend-build

WORKDIR /app

ARG REACT_APP_SUPABASE_URL
ARG REACT_APP_SUPABASE_ANON_KEY
ENV REACT_APP_SUPABASE_URL=$REACT_APP_SUPABASE_URL
ENV REACT_APP_SUPABASE_ANON_KEY=$REACT_APP_SUPABASE_ANON_KEY
ENV REACT_APP_API_BASE_URL=""
ENV CI=false
ENV DISABLE_ESLINT_PLUGIN=true

COPY package.json package-lock.json ./
RUN npm ci

COPY public ./public
COPY src ./src
COPY tailwind.config.js postcss.config.js ./
RUN node node_modules/react-scripts/scripts/build.js

FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app/backend

COPY backend/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-build /app/build /app/frontend-build

EXPOSE 8000

CMD ["gunicorn", "main:app", "--workers", "2", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "--access-logfile", "-", "--error-logfile", "-"]
