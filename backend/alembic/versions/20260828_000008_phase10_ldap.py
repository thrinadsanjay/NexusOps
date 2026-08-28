"""phase10 ldap – ldap_servers, ldap_sync_logs

Revision ID: 000000000008
Revises: 000000000007
Create Date: 2026-08-28 00:01:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "000000000008"
down_revision = "000000000007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ldap_servers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("host", sa.String(255), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False, server_default="389"),
        sa.Column("use_ssl", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("use_tls", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("base_dn", sa.String(255), nullable=False),
        sa.Column("bind_dn", sa.String(255), nullable=True),
        sa.Column("bind_password", sa.String(255), nullable=True),
        sa.Column("user_search_base", sa.String(255), nullable=True),
        sa.Column("user_filter", sa.String(255), nullable=False, server_default="(objectClass=person)"),
        sa.Column("user_attr_map", sa.Text(), nullable=False, server_default='{"username":"sAMAccountName","email":"mail","full_name":"cn"}'),
        sa.Column("group_search_base", sa.String(255), nullable=True),
        sa.Column("status", sa.String(40), nullable=False, server_default="active"),
        sa.Column("last_sync_at", sa.DateTime(), nullable=True),
        sa.Column("last_test_at", sa.DateTime(), nullable=True),
        sa.Column("last_test_status", sa.String(40), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_ldap_servers_name", "ldap_servers", ["name"])

    op.create_table(
        "ldap_sync_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("server_id", sa.Integer(), sa.ForeignKey("ldap_servers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(40), nullable=False, server_default="running"),
        sa.Column("users_found", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("users_created", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("users_updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_ldap_sync_logs_server_id", "ldap_sync_logs", ["server_id"])


def downgrade() -> None:
    op.drop_table("ldap_sync_logs")
    op.drop_table("ldap_servers")
