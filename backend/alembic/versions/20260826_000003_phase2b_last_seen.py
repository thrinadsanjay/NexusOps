"""phase2b – add last_seen_at to ip_addresses

Revision ID: 000000000003
Revises: 000000000002
Create Date: 2026-08-26 00:02:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "000000000003"
down_revision = "000000000002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ip_addresses", sa.Column("last_seen_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("ip_addresses", "last_seen_at")
