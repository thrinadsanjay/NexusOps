FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PIP_INDEX_URL=https://artifactory.colruyt.int/artifactory/api/pypi/pypi-remote/simple \
    PIP_TRUSTED_HOST=artifactory.colruyt.int \
    PIP_DEFAULT_TIMEOUT=300

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt --trusted-host files.pythonhosted.org --trusted-host pypi.org

COPY . /app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
