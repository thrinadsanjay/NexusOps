"""phase9 pki – certificate_authorities, certificates

Revision ID: 000000000007
Revises: 000000000006
Create Date: 2026-08-28 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "000000000007"
down_revision = "000000000006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "certificate_authorities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("common_name", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(500), nullable=True),
        sa.Column("is_root", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("status", sa.String(40), nullable=False, server_default="active"),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_certificate_authorities_name", "certificate_authorities", ["name"])

    op.create_table(
        "certificates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ca_id", sa.Integer(), sa.ForeignKey("certificate_authorities.id", ondelete="SET NULL"), nullable=True),
        sa.Column("common_name", sa.String(255), nullable=False),
        sa.Column("subject_alt_names", sa.Text(), nullable=True),
        sa.Column("cert_type", sa.String(40), nullable=False, server_default="server"),
        sa.Column("status", sa.String(40), nullable=False, server_default="active"),
        sa.Column("serial_number", sa.String(120), nullable=True),
        sa.Column("fingerprint", sa.String(255), nullable=True),
        sa.Column("issued_to", sa.String(255), nullable=True),
        sa.Column("issued_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("host_id", sa.Integer(), sa.ForeignKey("hosts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_certificates_common_name", "certificates", ["common_name"])
    op.create_index("ix_certificates_ca_id", "certificates", ["ca_id"])
    op.create_index("ix_certificates_expires_at", "certificates", ["expires_at"])
    op.create_index("ix_certificates_serial_number", "certificates", ["serial_number"])
    op.create_index("ix_certificates_host_id", "certificates", ["host_id"])


def downgrade() -> None:
    op.drop_table("certificates")
    op.drop_table("certificate_authorities")
