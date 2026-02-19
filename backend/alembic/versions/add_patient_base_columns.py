"""add patient base columns (sync with patient-dashboard)

Revision ID: add_patient_base_001
Revises: add_data_type_001
Create Date: 2026-02-18

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_patient_base_001'
down_revision = 'add_data_type_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add base columns to patients table (in sync with patient-dashboard)
    op.add_column('patients', sa.Column('date_of_birth', sa.Date(), nullable=True))
    op.add_column('patients', sa.Column('age', sa.Integer(), nullable=True))
    op.add_column('patients', sa.Column('gender', sa.String(), nullable=True))
    op.add_column('patients', sa.Column('psa_level', sa.Float(), nullable=True))
    op.add_column('patients', sa.Column('clinical_stage', sa.String(), nullable=True))
    op.add_column('patients', sa.Column('ethnicity', sa.String(), nullable=True))
    op.add_column('patients', sa.Column('insurance', sa.String(), nullable=True))
    op.add_column('patients', sa.Column('phone', sa.String(), nullable=True))
    op.add_column('patients', sa.Column('email', sa.String(), nullable=True))
    op.add_column('patients', sa.Column('address', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('patients', 'address')
    op.drop_column('patients', 'email')
    op.drop_column('patients', 'phone')
    op.drop_column('patients', 'insurance')
    op.drop_column('patients', 'ethnicity')
    op.drop_column('patients', 'clinical_stage')
    op.drop_column('patients', 'psa_level')
    op.drop_column('patients', 'gender')
    op.drop_column('patients', 'age')
    op.drop_column('patients', 'date_of_birth')
