from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_DEFAULT_SECRETS = frozenset(
    {
        "change-me-in-production",
        "change-me",
        "ChangeMe123!",
        "NexusOps2024!",
        "readonly",
    }
)

NON_PRODUCTION_ENVS = frozenset({"development", "dev", "test", "testing", "local"})


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
    session_cookie_secure: bool = Field(default=False)
    secret_key: str = Field(default="change-me-in-production", alias="JWT_SECRET_KEY")
    algorithm: str = Field(default="HS256")
    access_token_expire_minutes: int = Field(default=60)
    default_admin_email: str = Field(default="admin@nexusops.local")
    default_admin_username: str = Field(default="admin")
    default_admin_password: str = Field(default="ChangeMe123!")
    scan_networks: str = Field(default="")
    max_scan_hosts: int = Field(default=256)
    login_max_attempts: int = Field(default=5)
    login_lockout_seconds: int = Field(default=900)
    ldap_admin_password: str = Field(default="NexusOps2024!")
    ldap_domain: str = Field(default="homelab.local")
    ldap_base_dn: str = Field(default="dc=homelab,dc=local")
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def is_production_like(self) -> bool:
        return self.app_env.lower() not in NON_PRODUCTION_ENVS


def validate_runtime_secrets(values: Settings | None = None) -> None:
    current = values or get_settings()
    if not current.is_production_like:
        return

    problems: list[str] = []
    if current.secret_key in INSECURE_DEFAULT_SECRETS or len(current.secret_key) < 32:
        problems.append("JWT_SECRET_KEY must be a unique secret of at least 32 characters")
    if current.default_admin_password in INSECURE_DEFAULT_SECRETS:
        problems.append("DEFAULT_ADMIN_PASSWORD must not use the bundled development default")
    if current.ldap_admin_password in INSECURE_DEFAULT_SECRETS:
        problems.append("LDAP_ADMIN_PASSWORD must not use the bundled development default")
    if problems:
        raise RuntimeError(
            "Refusing to start in a non-development environment with insecure defaults: "
            + "; ".join(problems)
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
