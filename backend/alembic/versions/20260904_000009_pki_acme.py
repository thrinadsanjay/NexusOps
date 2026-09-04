"""pki acme – Let's Encrypt issuance columns and HTTP-01 tokens

Revision ID: 000000000009
Revises: 000000000008
Create Date: 2026-09-04 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "000000000009"
down_revision = "000000000008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("certificate_authorities", sa.Column("kind", sa.String(40), nullable=False, server_default="internal"))
    op.add_column("certificate_authorities", sa.Column("acme_directory", sa.String(40), nullable=True))
    op.add_column("certificate_authorities", sa.Column("acme_email", sa.String(255), nullable=True))
    op.add_column("certificate_authorities", sa.Column("acme_account_key_pem", sa.Text(), nullable=True))
    op.add_column("certificate_authorities", sa.Column("acme_account_url", sa.String(500), nullable=True))
    op.add_column("certificate_authorities", sa.Column("acme_tos_agreed", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("certificate_authorities", sa.Column("dns_provider", sa.String(40), nullable=False, server_default="manual"))
    op.add_column("certificate_authorities", sa.Column("dns_api_token", sa.Text(), nullable=True))

    op.add_column("certificates", sa.Column("private_key_pem", sa.Text(), nullable=True))
    op.add_column("certificates", sa.Column("certificate_pem", sa.Text(), nullable=True))
    op.add_column("certificates", sa.Column("chain_pem", sa.Text(), nullable=True))
    op.add_column("certificates", sa.Column("acme_order_url", sa.String(500), nullable=True))
    op.add_column("certificates", sa.Column("acme_challenge_type", sa.String(40), nullable=True))
    op.add_column("certificates", sa.Column("acme_error", sa.Text(), nullable=True))
    op.add_column("certificates", sa.Column("acme_pending_json", sa.Text(), nullable=True))

    op.create_table(
        "acme_http_challenges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token", sa.String(255), nullable=False),
        sa.Column("key_authorization", sa.String(500), nullable=False),
        sa.Column("certificate_id", sa.Integer(), sa.ForeignKey("certificates.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_acme_http_challenges_token", "acme_http_challenges", ["token"], unique=True)
    op.create_index("ix_acme_http_challenges_certificate_id", "acme_http_challenges", ["certificate_id"])


def downgrade() -> None:
    op.drop_index("ix_acme_http_challenges_certificate_id", table_name="acme_http_challenges")
    op.drop_index("ix_acme_http_challenges_token", table_name="acme_http_challenges")
    op.drop_table("acme_http_challenges")
    op.drop_column("certificates", "acme_pending_json")
    op.drop_column("certificates", "acme_error")
    op.drop_column("certificates", "acme_challenge_type")
    op.drop_column("certificates", "acme_order_url")
    op.drop_column("certificates", "chain_pem")
    op.drop_column("certificates", "certificate_pem")
    op.drop_column("certificates", "private_key_pem")
    op.drop_column("certificate_authorities", "dns_api_token")
    op.drop_column("certificate_authorities", "dns_provider")
    op.drop_column("certificate_authorities", "acme_tos_agreed")
    op.drop_column("certificate_authorities", "acme_account_url")
    op.drop_column("certificate_authorities", "acme_account_key_pem")
    op.drop_column("certificate_authorities", "acme_email")
    op.drop_column("certificate_authorities", "acme_directory")
    op.drop_column("certificate_authorities", "kind")
