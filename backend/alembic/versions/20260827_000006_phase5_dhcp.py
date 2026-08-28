"""phase5 dhcp – dhcp_servers, dhcp_pools, dhcp_leases, dhcp_reservations

Revision ID: 000000000006
Revises: 000000000005
Create Date: 2026-08-27 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "000000000006"
down_revision = "000000000005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dhcp_servers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("host", sa.String(255), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("status", sa.String(40), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "dhcp_pools",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("server_id", sa.Integer(), sa.ForeignKey("dhcp_servers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subnet", sa.String(50), nullable=False),
        sa.Column("range_start", sa.String(50), nullable=False),
        sa.Column("range_end", sa.String(50), nullable=False),
        sa.Column("gateway", sa.String(50), nullable=True),
        sa.Column("dns_servers", sa.String(255), nullable=True),
        sa.Column("lease_time", sa.Integer(), nullable=False, server_default="86400"),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_dhcp_pools_server_id", "dhcp_pools", ["server_id"])

    op.create_table(
        "dhcp_leases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pool_id", sa.Integer(), sa.ForeignKey("dhcp_pools.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ip_address", sa.String(50), nullable=False),
        sa.Column("mac_address", sa.String(20), nullable=False),
        sa.Column("hostname", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("lease_start", sa.DateTime(), nullable=True),
        sa.Column("lease_end", sa.DateTime(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_dhcp_leases_ip_address", "dhcp_leases", ["ip_address"])
    op.create_index("ix_dhcp_leases_mac_address", "dhcp_leases", ["mac_address"])
    op.create_index("ix_dhcp_leases_pool_id", "dhcp_leases", ["pool_id"])

    op.create_table(
        "dhcp_reservations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pool_id", sa.Integer(), sa.ForeignKey("dhcp_pools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ip_address", sa.String(50), nullable=False),
        sa.Column("mac_address", sa.String(20), nullable=False),
        sa.Column("hostname", sa.String(255), nullable=True),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_dhcp_reservations_pool_id", "dhcp_reservations", ["pool_id"])
    op.create_index("ix_dhcp_reservations_ip_address", "dhcp_reservations", ["ip_address"])
    op.create_index("ix_dhcp_reservations_mac_address", "dhcp_reservations", ["mac_address"])


def downgrade() -> None:
    op.drop_table("dhcp_reservations")
    op.drop_table("dhcp_leases")
    op.drop_table("dhcp_pools")
    op.drop_table("dhcp_servers")
