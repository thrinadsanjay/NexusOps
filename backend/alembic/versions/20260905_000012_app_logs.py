"""application log table for the system logs page

Revision ID: 000000000012
Revises: 000000000011
Create Date: 2026-09-05 17:10:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "000000000012"
down_revision = "000000000011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("level", sa.String(20), nullable=False),
        sa.Column("logger", sa.String(120), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_app_logs_level", "app_logs", ["level"])
    op.create_index("ix_app_logs_logger", "app_logs", ["logger"])
    op.create_index("ix_app_logs_created_at", "app_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_app_logs_created_at", table_name="app_logs")
    op.drop_index("ix_app_logs_logger", table_name="app_logs")
    op.drop_index("ix_app_logs_level", table_name="app_logs")
    op.drop_table("app_logs")
