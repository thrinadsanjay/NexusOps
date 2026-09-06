"""dhcp local server and router fetch columns

Revision ID: 000000000013
Revises: 000000000012
Create Date: 2026-09-06 11:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "000000000013"
down_revision = "000000000012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dhcp_servers", sa.Column("kind", sa.String(20), nullable=False, server_default="registry"))
    op.add_column("dhcp_servers", sa.Column("router_type", sa.String(40), nullable=True))
    op.add_column("dhcp_servers", sa.Column("router_username", sa.String(120), nullable=True))
    op.add_column("dhcp_servers", sa.Column("router_password_encrypted", sa.Text(), nullable=True))
    op.add_column("dhcp_servers", sa.Column("router_port", sa.Integer(), nullable=True))
    op.add_column("dhcp_servers", sa.Column("router_https", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("dhcp_servers", sa.Column("last_fetch_at", sa.DateTime(), nullable=True))
    op.add_column("dhcp_servers", sa.Column("last_fetch_error", sa.Text(), nullable=True))
    op.add_column("dhcp_servers", sa.Column("last_fetch_count", sa.Integer(), nullable=True))
    op.add_column("dhcp_leases", sa.Column("source", sa.String(20), nullable=False, server_default="manual"))


def downgrade() -> None:
    op.drop_column("dhcp_leases", "source")
    op.drop_column("dhcp_servers", "last_fetch_count")
    op.drop_column("dhcp_servers", "last_fetch_error")
    op.drop_column("dhcp_servers", "last_fetch_at")
    op.drop_column("dhcp_servers", "router_https")
    op.drop_column("dhcp_servers", "router_port")
    op.drop_column("dhcp_servers", "router_password_encrypted")
    op.drop_column("dhcp_servers", "router_username")
    op.drop_column("dhcp_servers", "router_type")
    op.drop_column("dhcp_servers", "kind")
