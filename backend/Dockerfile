FROM python:3.12 AS builder

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12 AS runtime

WORKDIR /app

COPY --from=builder /usr/local /usr/local

COPY . .

RUN mkdir -p /app/data /app/data/projects

EXPOSE 8000

HEALTHCHECK --interval=60s --timeout=15s --retries=5 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["gunicorn", "nautilus_fastapi:app", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "--timeout", "600"]
