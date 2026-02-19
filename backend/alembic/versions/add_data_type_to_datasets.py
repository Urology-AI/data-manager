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
    # Add data_type column to datasets table
    op.add_column('datasets', 
        sa.Column('data_type', sa.String(), nullable=True, server_default='generic')
    )
    # Update existing rows to have 'generic' as default
    op.execute("UPDATE datasets SET data_type = 'generic' WHERE data_type IS NULL")


def downgrade() -> None:
    # Remove data_type column from datasets table
    op.drop_column('datasets', 'data_type')
