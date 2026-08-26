"""phase2 ipam – vlans, subnets, ip_addresses

Revision ID: 000000000002
Revises: 000000000001
Create Date: 2026-08-26 00:01:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "000000000002"
down_revision = "000000000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vlans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("vid", sa.Integer(), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("status", sa.String(40), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_vlans_vid", "vlans", ["vid"])

    op.create_table(
        "subnets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cidr", sa.String(50), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("gateway", sa.String(50), nullable=True),
        sa.Column("vlan_id", sa.Integer(), sa.ForeignKey("vlans.id"), nullable=True),
        sa.Column("status", sa.String(40), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_subnets_cidr", "subnets", ["cidr"])
    op.create_index("ix_subnets_vlan_id", "subnets", ["vlan_id"])

    op.create_table(
        "ip_addresses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("address", sa.String(50), nullable=False, unique=True),
        sa.Column("subnet_id", sa.Integer(), sa.ForeignKey("subnets.id"), nullable=True),
        sa.Column("hostname", sa.String(255), nullable=True),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("status", sa.String(40), nullable=False, server_default="available"),
        sa.Column("dns_name", sa.String(255), nullable=True),
        sa.Column("mac_address", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_ip_addresses_address", "ip_addresses", ["address"])
    op.create_index("ix_ip_addresses_subnet_id", "ip_addresses", ["subnet_id"])


def downgrade() -> None:
    op.drop_table("ip_addresses")
    op.drop_table("subnets")
    op.drop_table("vlans")
