"""smtp – relays and message log

Revision ID: 000000000010
Revises: 000000000009
Create Date: 2026-09-05 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "000000000010"
down_revision = "000000000009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "smtp_relays",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False, server_default="custom"),
        sa.Column("host", sa.String(255), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False, server_default="587"),
        sa.Column("encryption", sa.String(20), nullable=False, server_default="starttls"),
        sa.Column("username", sa.String(255), nullable=True),
        sa.Column("password", sa.String(500), nullable=True),
        sa.Column("from_address", sa.String(255), nullable=False),
        sa.Column(
            "allowed_networks",
            sa.String(500),
            nullable=False,
            server_default="10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.1/32",
        ),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_test_at", sa.DateTime(), nullable=True),
        sa.Column("last_test_status", sa.String(40), nullable=True),
        sa.Column("last_test_error", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_smtp_relays_name", "smtp_relays", ["name"])

    op.create_table(
        "smtp_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("relay_id", sa.Integer(), sa.ForeignKey("smtp_relays.id", ondelete="SET NULL"), nullable=True),
        sa.Column("direction", sa.String(20), nullable=False, server_default="outbound"),
        sa.Column("sender", sa.String(255), nullable=False),
        sa.Column("recipients", sa.Text(), nullable=False),
        sa.Column("subject", sa.String(500), nullable=True),
        sa.Column("status", sa.String(40), nullable=False, server_default="sent"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_smtp_messages_relay_id", "smtp_messages", ["relay_id"])


def downgrade() -> None:
    op.drop_table("smtp_messages")
    op.drop_table("smtp_relays")
