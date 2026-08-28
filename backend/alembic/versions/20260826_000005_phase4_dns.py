"""phase4 dns – dns_zones, dns_records

Revision ID: 000000000005
Revises: 000000000004
Create Date: 2026-08-26 00:04:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "000000000005"
down_revision = "000000000004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dns_zones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, unique=True),
        sa.Column("kind", sa.String(20), nullable=False, server_default="forward"),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("default_ttl", sa.Integer(), nullable=False, server_default="300"),
        sa.Column("status", sa.String(40), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_dns_zones_name", "dns_zones", ["name"])

    op.create_table(
        "dns_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("zone_id", sa.Integer(), sa.ForeignKey("dns_zones.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("record_type", sa.String(10), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("ttl", sa.Integer(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=True),
        sa.Column("comment", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_dns_records_zone_id", "dns_records", ["zone_id"])
    op.create_index("ix_dns_records_name", "dns_records", ["name"])
    op.create_index("ix_dns_records_type", "dns_records", ["record_type"])


def downgrade() -> None:
    op.drop_table("dns_records")
    op.drop_table("dns_zones")
