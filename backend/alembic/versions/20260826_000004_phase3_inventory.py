"""phase3 inventory – host_groups, host_tags, hosts

Revision ID: 000000000004
Revises: 000000000003
Create Date: 2026-08-26 00:03:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "000000000004"
down_revision = "000000000003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "host_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False, unique=True),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_host_groups_name", "host_groups", ["name"])

    op.create_table(
        "host_tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False, unique=True),
        sa.Column("color", sa.String(30), nullable=False, server_default="cyan"),
    )
    op.create_index("ix_host_tags_name", "host_tags", ["name"])

    op.create_table(
        "hosts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("hostname", sa.String(255), nullable=False),
        sa.Column("fqdn", sa.String(255), nullable=True),
        sa.Column("ip_address", sa.String(50), nullable=True),
        sa.Column("mac_address", sa.String(20), nullable=True),
        sa.Column("os", sa.String(120), nullable=True),
        sa.Column("role", sa.String(120), nullable=True),
        sa.Column("status", sa.String(40), nullable=False, server_default="active"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("subnet_id", sa.Integer(), sa.ForeignKey("subnets.id"), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_hosts_hostname", "hosts", ["hostname"])
    op.create_index("ix_hosts_ip_address", "hosts", ["ip_address"])
    op.create_index("ix_hosts_fqdn", "hosts", ["fqdn"])
    op.create_index("ix_hosts_subnet_id", "hosts", ["subnet_id"])

    op.create_table(
        "host_group_members",
        sa.Column("host_id", sa.Integer(), sa.ForeignKey("hosts.id"), primary_key=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("host_groups.id"), primary_key=True),
    )

    op.create_table(
        "host_tag_members",
        sa.Column("host_id", sa.Integer(), sa.ForeignKey("hosts.id"), primary_key=True),
        sa.Column("tag_id", sa.Integer(), sa.ForeignKey("host_tags.id"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("host_tag_members")
    op.drop_table("host_group_members")
    op.drop_table("hosts")
    op.drop_table("host_tags")
    op.drop_table("host_groups")
