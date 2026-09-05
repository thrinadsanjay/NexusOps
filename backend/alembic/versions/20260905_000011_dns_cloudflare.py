"""dns cloudflare account and zone sync columns

Revision ID: 000000000011
Revises: 000000000010
Create Date: 2026-09-05 00:10:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "000000000011"
down_revision = "000000000010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dns_cloud_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False, server_default="cloudflare"),
        sa.Column("token_encrypted", sa.Text(), nullable=False),
        sa.Column("last_test_at", sa.DateTime(), nullable=True),
        sa.Column("last_test_status", sa.String(40), nullable=True),
        sa.Column("last_test_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.add_column("dns_zones", sa.Column("cloud_account_id", sa.Integer(), sa.ForeignKey("dns_cloud_accounts.id"), nullable=True))
    op.add_column("dns_zones", sa.Column("cloudflare_zone_id", sa.String(64), nullable=True))
    op.add_column("dns_zones", sa.Column("last_sync_at", sa.DateTime(), nullable=True))
    op.add_column("dns_zones", sa.Column("last_sync_direction", sa.String(20), nullable=True))
    op.add_column("dns_zones", sa.Column("last_sync_status", sa.String(40), nullable=True))
    op.add_column("dns_zones", sa.Column("last_sync_error", sa.Text(), nullable=True))
    op.create_index("ix_dns_zones_cloud_account_id", "dns_zones", ["cloud_account_id"])
    op.add_column("dns_records", sa.Column("cloudflare_record_id", sa.String(64), nullable=True))
    op.create_index("ix_dns_records_cloudflare_record_id", "dns_records", ["cloudflare_record_id"])


def downgrade() -> None:
    op.drop_index("ix_dns_records_cloudflare_record_id", table_name="dns_records")
    op.drop_column("dns_records", "cloudflare_record_id")
    op.drop_index("ix_dns_zones_cloud_account_id", table_name="dns_zones")
    op.drop_column("dns_zones", "last_sync_error")
    op.drop_column("dns_zones", "last_sync_status")
    op.drop_column("dns_zones", "last_sync_direction")
    op.drop_column("dns_zones", "last_sync_at")
    op.drop_column("dns_zones", "cloudflare_zone_id")
    op.drop_column("dns_zones", "cloud_account_id")
    op.drop_table("dns_cloud_accounts")
