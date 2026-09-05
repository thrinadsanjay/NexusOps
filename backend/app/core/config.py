from __future__ import annotations

from functools import lru_cache
from typing import Any

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="nexusops")
    app_env: str = Field(default="development")
    app_debug: bool = Field(default=False)
    app_host: str = Field(default="0.0.0.0")
    app_port: int = Field(default=8000)
    app_base_url: str = Field(default="http://localhost:8000")
    frontend_url: str = Field(default="http://localhost:5173")

    database_url: str = Field(default="sqlite:///./nexusops.db")
    redis_url: str = Field(default="redis://localhost:6379/0")
    celery_broker_url: str = Field(default="redis://localhost:6379/0")
    celery_result_backend: str = Field(default="redis://localhost:6379/0")

    log_level: str = Field(default="INFO")
    session_timeout_minutes: int = Field(default=60)
    secret_key: str = Field(default="change-me-in-production", alias="JWT_SECRET_KEY")
    algorithm: str = Field(default="HS256")
    access_token_expire_minutes: int = Field(default=60)
    default_admin_email: str = Field(default="admin@nexusops.local")
    default_admin_username: str = Field(default="admin")
    default_admin_password: str = Field(default="ChangeMe123!")
    # Comma-separated LAN CIDRs to surface in the discover endpoint, e.g. "192.168.1.0/24,10.0.0.0/8"
    scan_networks: str = Field(default="")    # Bundled LDAP container
    ldap_admin_password: str = Field(default="NexusOps2024!")
    ldap_domain: str = Field(default="homelab.local")
    ldap_base_dn: str = Field(default="dc=homelab,dc=local")
    smtp_listen_enable: bool = Field(default=False)
    smtp_listen_host: str = Field(default="0.0.0.0")
    smtp_listen_port: int = Field(default=2525)
    smtp_published_port: int = Field(default=25)
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
