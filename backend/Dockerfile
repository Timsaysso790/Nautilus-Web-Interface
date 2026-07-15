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

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["python3", "nautilus_fastapi.py"]
