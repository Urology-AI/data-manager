"""Initial migration

Revision ID: initial_schema_000
Revises: 
Create Date: 2026-02-19 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'initial_schema_000'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table('users',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('full_name', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_verified', sa.Boolean(), nullable=True),
        sa.Column('verification_token', sa.String(), nullable=True),
        sa.Column('reset_token', sa.String(), nullable=True),
        sa.Column('reset_token_expires', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    op.create_table('login_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('email_verified_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_login_sessions_email'), 'login_sessions', ['email'], unique=False)

    op.create_table('data_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('encrypted_encryption_key', sa.String(), nullable=False),
        sa.Column('key_salt', sa.String(), nullable=False),
        sa.Column('unlock_password_hash', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_data_sessions_user_id'), 'data_sessions', ['user_id'], unique=False)

    op.create_table('datasets',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('session_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('source_filename', sa.String(), nullable=False),
        sa.Column('stored_path', sa.String(), nullable=False),
        sa.Column('column_map', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['session_id'], ['data_sessions.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_datasets_session_id'), 'datasets', ['session_id'], unique=False)
    op.create_index(op.f('ix_datasets_user_id'), 'datasets', ['user_id'], unique=False)

    op.create_table('patients',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('dataset_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('patient_key', sa.String(), nullable=False),
        sa.Column('date_of_service', sa.DateTime(), nullable=True),
        sa.Column('location', sa.String(), nullable=True),
        sa.Column('mrn', sa.String(), nullable=True),
        sa.Column('first_name', sa.String(), nullable=True),
        sa.Column('last_name', sa.String(), nullable=True),
        sa.Column('reason_for_visit', sa.String(), nullable=True),
        sa.Column('points', sa.Float(), nullable=True),
        sa.Column('percent', sa.Float(), nullable=True),
        sa.Column('category', sa.String(), nullable=True),
        sa.Column('pca_confirmed', sa.Boolean(), nullable=True),
        sa.Column('gleason_grade', sa.String(), nullable=True),
        sa.Column('age_group', sa.String(), nullable=True),
        sa.Column('family_history', sa.String(), nullable=True),
        sa.Column('race', sa.String(), nullable=True),
        sa.Column('genetic_mutation', sa.String(), nullable=True),
        sa.Column('raw', sa.JSON(), nullable=True),
        sa.Column('extra_fields', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

def downgrade() -> None:
    op.drop_table('patients')
    op.drop_index(op.f('ix_datasets_user_id'), table_name='datasets')
    op.drop_index(op.f('ix_datasets_session_id'), table_name='datasets')
    op.drop_table('datasets')
    op.drop_index(op.f('ix_data_sessions_user_id'), table_name='data_sessions')
    op.drop_table('data_sessions')
    op.drop_index(op.f('ix_login_sessions_email'), table_name='login_sessions')
    op.drop_table('login_sessions')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
