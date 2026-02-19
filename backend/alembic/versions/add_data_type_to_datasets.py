"""add_data_type_to_datasets

Revision ID: add_data_type_001
Revises: 
Create Date: 2026-02-18 15:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_data_type_001'
down_revision = 'initial_schema_000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('datasets', schema=None) as batch_op:
        batch_op.add_column(sa.Column('data_type', sa.String(), nullable=True, server_default='generic'))

    # The server_default handles new and existing rows, but for older DBs, a manual update might be needed.
    # This is safe to run as it only affects rows where the column is NULL.
    op.execute("UPDATE datasets SET data_type = 'generic' WHERE data_type IS NULL")


def downgrade() -> None:
    with op.batch_alter_table('datasets', schema=None) as batch_op:
        batch_op.drop_column('data_type')
